// scripts/test-adaptive-system.ts
//
// Black-box verification of the Sprint 2 adaptive engine.
// Runs 6 scenarios × 10 iterations against a live Express server.
// Uses real Postgres + Redis. Per-run fresh test students; no cleanup.
//
// Prereq: start the server in another terminal:
//   npm run dev
// Then run:
//   npm run test:adaptive
//
// Optional: TEST_BASE_URL=http://localhost:3000 (default)
//
// Exit code 0 if all scenarios pass their criteria, 1 otherwise.

import 'dotenv/config';
import { randomUUID } from 'crypto';
import pool from '../src/db/client';
import redis from '../src/redis/client';
import { sessionKey, SESSION_TTL_S } from '../src/redis/keys';
import type { RedisSession } from '../src/types/schema';

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:3000';
const RUNS_PER_SCENARIO = 10;

// ─── HTTP helper ──────────────────────────────────────────────────────────────

type Cookie = string;

interface HttpResult<T = any> {
  status: number;
  body: T;
  cookie: Cookie | undefined;
}

async function http<T = any>(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
  cookie?: Cookie,
): Promise<HttpResult<T>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // Extract token cookie from Set-Cookie if present
  let newCookie: Cookie | undefined;
  const setCookieList =
    (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ??
    (res.headers.get('set-cookie') ? [res.headers.get('set-cookie') as string] : []);
  for (const c of setCookieList) {
    if (c.startsWith('token=')) newCookie = c.split(';')[0];
  }

  const text = await res.text();
  const parsed = text ? (JSON.parse(text) as T) : (null as unknown as T);
  return { status: res.status, body: parsed, cookie: newCookie ?? cookie };
}

// ─── Redis helpers (direct manipulation for unreachable state) ────────────────

async function readRedisSession(sessionId: string): Promise<RedisSession> {
  const raw = await redis.get(sessionKey(sessionId));
  if (!raw) throw new Error(`Redis session missing: ${sessionId}`);
  return JSON.parse(raw) as RedisSession;
}

async function writeRedisSession(sessionId: string, session: RedisSession): Promise<void> {
  await redis.set(sessionKey(sessionId), JSON.stringify(session), 'EX', SESSION_TTL_S);
}

// ─── DB verification helpers ──────────────────────────────────────────────────

interface InterventionRow {
  trigger_type: string;
  trigger_value: { idleStreakS?: number; consecutiveErrors?: number; hintsUsed?: number } | null;
  response_type: string;
  session_id: string;
  created_at: Date;
}

async function getInterventions(studentId: string): Promise<InterventionRow[]> {
  const r = await pool.query<InterventionRow>(
    `SELECT trigger_type, trigger_value, response_type, session_id, created_at
       FROM intervention_events WHERE student_id = $1 ORDER BY created_at ASC`,
    [studentId],
  );
  return r.rows;
}

async function getAdaptiveConfig(studentId: string) {
  const r = await pool.query<{
    idle_threshold_s: number;
    error_threshold: number;
    hint_budget: number;
    response_length_budget: string;
  }>(
    `SELECT idle_threshold_s, error_threshold, hint_budget, response_length_budget
       FROM adaptive_config WHERE student_id=$1`,
    [studentId],
  );
  return r.rows[0];
}

async function getSkill(studentId: string, topic: string) {
  const r = await pool.query<{ tier: number; consecutive_up: number; consecutive_down: number }>(
    `SELECT tier, consecutive_up, consecutive_down FROM student_skills
       WHERE student_id=$1 AND topic=$2`,
    [studentId, topic],
  );
  return r.rows[0];
}

async function getGroundTruth(problemId: string): Promise<number> {
  const r = await pool.query<{ ground_truth_answer: string }>(
    'SELECT ground_truth_answer FROM problems WHERE id=$1',
    [problemId],
  );
  return Number(r.rows[0].ground_truth_answer);
}

// ─── Test student factory ─────────────────────────────────────────────────────

interface TestStudent {
  studentId: string;
  cookie: Cookie;
  sessionId: string;
}

async function createTestStudent(): Promise<TestStudent> {
  const email = `test+${randomUUID()}@adaptive.test`;
  const password = 'test-password-123!';

  // 1. Register (consent=true sets consent_given_at in the same call)
  const reg = await http<{ id: string }>('POST', '/api/auth/register', {
    email,
    password,
    course_level: 'intro',
    consent: true,
  });
  if (reg.status !== 201) throw new Error(`register: ${reg.status} ${JSON.stringify(reg.body)}`);
  if (!reg.cookie) throw new Error('register: no auth cookie returned');
  const studentId = reg.body.id;
  const cookie = reg.cookie;

  // 2. Declaration — default thresholds (idle=90, errors=3, hints=3, medium)
  const decl = await http('POST', '/api/onboarding/declaration', {
    adhd_flag: false,
    stress_baseline: 0,
    course_level: 'intro',
  }, cookie);
  if (decl.status !== 200) {
    throw new Error(`declaration: ${decl.status} ${JSON.stringify(decl.body)}`);
  }

  // 3. Diagnostic problems
  const probs = await http<{ problems: Array<{ id: string }> }>(
    'GET', '/api/onboarding/problems', undefined, cookie,
  );
  if (probs.status !== 200) {
    throw new Error(`onboarding/problems: ${probs.status} ${JSON.stringify(probs.body)}`);
  }

  // 4. Submit diagnostic answers (zeros — cold-start tier becomes 1 or 2)
  const answers = probs.body.problems.map(p => ({
    problem_id: p.id,
    submitted_answer: 0,
    time_spent_s: 30,
  }));
  const diag = await http('POST', '/api/onboarding/diagnostic', { answers }, cookie);
  if (diag.status !== 200) {
    throw new Error(`diagnostic: ${diag.status} ${JSON.stringify(diag.body)}`);
  }

  // 5. Fresh session for the scenario
  const sess = await http<{ session_id: string }>('POST', '/api/sessions', {}, cookie);
  if (sess.status !== 201) {
    throw new Error(`sessions: ${sess.status} ${JSON.stringify(sess.body)}`);
  }

  return { studentId, cookie, sessionId: sess.body.session_id };
}

// ─── Scenarios ────────────────────────────────────────────────────────────────

type ScenarioResult = { ok: true } | { ok: false; reason: string };

// S1 — Idle breach. Backdate Redis last_input_at, then heartbeat.
async function scenarioIdle(): Promise<ScenarioResult> {
  const s = await createTestStudent();

  const session = await readRedisSession(s.sessionId);
  session.last_input_at = new Date(Date.now() - 120_000).toISOString(); // 120s ago, threshold is 90
  await writeRedisSession(s.sessionId, session);

  const hb = await http<{ intervention: { type: string; idleStreakS: number } | null }>(
    'POST', `/api/sessions/${s.sessionId}/heartbeat`, {}, s.cookie,
  );
  if (hb.status !== 200) return { ok: false, reason: `heartbeat status ${hb.status}` };
  if (hb.body.intervention?.type !== 'idle') {
    return { ok: false, reason: `expected idle, got ${JSON.stringify(hb.body.intervention)}` };
  }

  const rows = await getInterventions(s.studentId);
  const idleRows = rows.filter(r => r.trigger_type === 'idle');
  if (idleRows.length !== 1) {
    return { ok: false, reason: `expected 1 idle row, got ${idleRows.length}` };
  }
  const row = idleRows[0];
  if (row.response_type !== 'hint') return { ok: false, reason: `response_type=${row.response_type}` };
  if (!row.trigger_value || (row.trigger_value.idleStreakS ?? 0) < 90) {
    return { ok: false, reason: `idleStreakS=${row.trigger_value?.idleStreakS}` };
  }
  if (!row.session_id) return { ok: false, reason: 'missing session_id' };
  return { ok: true };
}

// S2 — Error streak. Submit 3 wrong answers.
async function scenarioErrorStreak(): Promise<ScenarioResult> {
  const s = await createTestStudent();

  const next = await http<{ id: string }>('GET', '/api/problems/next', undefined, s.cookie);
  if (next.status !== 200) return { ok: false, reason: `next: ${next.status}` };
  const problemId = next.body.id;

  let lastIntervention: { type: string; consecutiveErrors?: number } | null = null;
  for (let i = 0; i < 3; i++) {
    const r = await http<{ intervention: { type: string; consecutiveErrors?: number } | null }>(
      'POST', `/api/problems/${problemId}/submit`,
      { session_id: s.sessionId, submitted_answer: -999999, time_spent_s: 5 },
      s.cookie,
    );
    if (r.status !== 200) return { ok: false, reason: `submit ${i}: ${r.status} ${JSON.stringify(r.body)}` };
    lastIntervention = r.body.intervention;
  }

  if (lastIntervention?.type !== 'error_streak') {
    return { ok: false, reason: `3rd intervention: ${JSON.stringify(lastIntervention)}` };
  }

  const rows = await getInterventions(s.studentId);
  const errRow = rows.find(r => r.trigger_type === 'error_streak');
  if (!errRow) return { ok: false, reason: 'no error_streak row' };
  if (!errRow.trigger_value || (errRow.trigger_value.consecutiveErrors ?? 0) < 3) {
    return { ok: false, reason: `consecutiveErrors=${errRow.trigger_value?.consecutiveErrors}` };
  }
  if (errRow.response_type !== 'hint') return { ok: false, reason: `response_type=${errRow.response_type}` };
  return { ok: true };
}

// S3 — Hint budget exhausted. Set Redis hints_used=3, submit correct (so error_streak does not fire first).
async function scenarioHintBudget(): Promise<ScenarioResult> {
  const s = await createTestStudent();

  const next = await http<{ id: string }>('GET', '/api/problems/next', undefined, s.cookie);
  if (next.status !== 200) return { ok: false, reason: `next: ${next.status}` };
  const problemId = next.body.id;
  const groundTruth = await getGroundTruth(problemId);

  // Bump Redis hints_used_this_problem to 3 (default budget). Submit handler reads this
  // value BEFORE the post-submit reset to 0, so the intervention fires on this attempt.
  const session = await readRedisSession(s.sessionId);
  session.hints_used_this_problem = 3;
  await writeRedisSession(s.sessionId, session);

  const submit = await http<{
    correct: boolean;
    intervention: { type: string; hintsUsed?: number } | null;
  }>(
    'POST', `/api/problems/${problemId}/submit`,
    { session_id: s.sessionId, submitted_answer: groundTruth, time_spent_s: 60 },
    s.cookie,
  );
  if (submit.status !== 200) return { ok: false, reason: `submit: ${submit.status}` };
  if (submit.body.intervention?.type !== 'hint_budget_exhausted') {
    return { ok: false, reason: `intervention: ${JSON.stringify(submit.body.intervention)}` };
  }

  const rows = await getInterventions(s.studentId);
  const row = rows.find(r => r.trigger_type === 'hint_budget_exhausted');
  if (!row) return { ok: false, reason: 'no hint_budget_exhausted row' };
  if (!row.trigger_value || (row.trigger_value.hintsUsed ?? 0) < 3) {
    return { ok: false, reason: `hintsUsed=${row.trigger_value?.hintsUsed}` };
  }
  if (row.response_type !== 'hint') return { ok: false, reason: `response_type=${row.response_type}` };
  return { ok: true };
}

// S4 — Clean run (negative). 3 problems, all correct, regular heartbeats. Zero interventions.
async function scenarioClean(): Promise<ScenarioResult> {
  const s = await createTestStudent();

  for (let i = 0; i < 3; i++) {
    // Simulate an engaged student: refresh last_input_at right before heartbeat
    const sess = await readRedisSession(s.sessionId);
    sess.last_input_at = new Date().toISOString();
    await writeRedisSession(s.sessionId, sess);

    const hb = await http<{ intervention: unknown }>(
      'POST', `/api/sessions/${s.sessionId}/heartbeat`, {}, s.cookie,
    );
    if (hb.status !== 200) return { ok: false, reason: `heartbeat ${i}: ${hb.status}` };
    if (hb.body.intervention !== null) {
      return { ok: false, reason: `unexpected heartbeat intervention ${i}: ${JSON.stringify(hb.body.intervention)}` };
    }

    const next = await http<{ id: string }>('GET', '/api/problems/next', undefined, s.cookie);
    if (next.status !== 200) return { ok: false, reason: `next ${i}: ${next.status}` };
    const problemId = next.body.id;
    const groundTruth = await getGroundTruth(problemId);

    const submit = await http<{ intervention: unknown }>(
      'POST', `/api/problems/${problemId}/submit`,
      { session_id: s.sessionId, submitted_answer: groundTruth, time_spent_s: 45 },
      s.cookie,
    );
    if (submit.status !== 200) return { ok: false, reason: `submit ${i}: ${submit.status}` };
    if (submit.body.intervention !== null) {
      return { ok: false, reason: `unexpected submit intervention ${i}: ${JSON.stringify(submit.body.intervention)}` };
    }
  }

  const rows = await getInterventions(s.studentId);
  if (rows.length > 0) {
    const types = rows.map(r => r.trigger_type).join(',');
    return { ok: false, reason: `${rows.length} false-alarm rows: ${types}` };
  }
  return { ok: true };
}

// S5 — Checkin recalculates thresholds. POST stress=2 → adaptive_config tightens to high-need values.
async function scenarioCheckin(): Promise<ScenarioResult> {
  const s = await createTestStudent();

  const before = await getAdaptiveConfig(s.studentId);
  if (
    before.idle_threshold_s !== 90 ||
    before.error_threshold !== 3 ||
    before.hint_budget !== 3 ||
    before.response_length_budget !== 'medium'
  ) {
    return { ok: false, reason: `unexpected initial config: ${JSON.stringify(before)}` };
  }

  const evt = await http(
    'POST', '/api/events',
    {
      event_type: 'checkin_response',
      payload: { session_id: s.sessionId, question_key: 'stress', numeric_value: 2 },
    },
    s.cookie,
  );
  if (evt.status !== 204 && evt.status !== 200) {
    return { ok: false, reason: `events: ${evt.status} ${JSON.stringify(evt.body)}` };
  }

  const after = await getAdaptiveConfig(s.studentId);
  if (after.idle_threshold_s !== 60) return { ok: false, reason: `idle_threshold_s=${after.idle_threshold_s}` };
  if (after.error_threshold !== 2) return { ok: false, reason: `error_threshold=${after.error_threshold}` };
  if (after.hint_budget !== 4) return { ok: false, reason: `hint_budget=${after.hint_budget}` };
  if (after.response_length_budget !== 'brief') {
    return { ok: false, reason: `response_length_budget=${after.response_length_budget}` };
  }
  return { ok: true };
}

// S6 — Tier up & down via hysteresis. Uses two topics on the same student.
async function scenarioTierUpDown(): Promise<ScenarioResult> {
  const s = await createTestStudent();

  // ── UP: kvl, 2 consecutive correct-no-hints → tier +1
  const upBefore = await getSkill(s.studentId, 'kvl');
  if (!upBefore) return { ok: false, reason: 'no kvl skill row' };
  const expectedUp = Math.min(3, upBefore.tier + 1);

  const upProbs = await pool.query<{ id: string }>(
    `SELECT id FROM problems WHERE topic='kvl' ORDER BY difficulty, id LIMIT 2`,
  );
  if (upProbs.rows.length < 2) return { ok: false, reason: 'need 2 kvl problems in DB' };

  for (const p of upProbs.rows) {
    // hints_used is 0 after createTestStudent / prior submit reset, but be explicit
    const sess = await readRedisSession(s.sessionId);
    sess.hints_used_this_problem = 0;
    await writeRedisSession(s.sessionId, sess);

    const gt = await getGroundTruth(p.id);
    const r = await http('POST', `/api/problems/${p.id}/submit`, {
      session_id: s.sessionId, submitted_answer: gt, time_spent_s: 30,
    }, s.cookie);
    if (r.status !== 200) return { ok: false, reason: `up submit: ${r.status} ${JSON.stringify(r.body)}` };
  }

  const upAfter = await getSkill(s.studentId, 'kvl');
  if (upAfter.tier !== expectedUp) {
    return { ok: false, reason: `up: tier ${upBefore.tier} → ${upAfter.tier} (expected ${expectedUp})` };
  }
  if (upAfter.consecutive_up !== 0) {
    return { ok: false, reason: `up: consecutive_up=${upAfter.consecutive_up} (expected 0 after promotion)` };
  }

  // ── DOWN: kcl, 2 consecutive hint-budget-exhausted → tier -1
  const downBefore = await getSkill(s.studentId, 'kcl');
  if (!downBefore) return { ok: false, reason: 'no kcl skill row' };
  const expectedDown = Math.max(0, downBefore.tier - 1);

  const downProbs = await pool.query<{ id: string }>(
    `SELECT id FROM problems WHERE topic='kcl' ORDER BY difficulty, id LIMIT 2`,
  );
  if (downProbs.rows.length < 2) return { ok: false, reason: 'need 2 kcl problems in DB' };

  for (const p of downProbs.rows) {
    // Set hints_used = 3 BEFORE the submit so hintBudgetExhausted=true in skill update
    const sess = await readRedisSession(s.sessionId);
    sess.hints_used_this_problem = 3;
    await writeRedisSession(s.sessionId, sess);

    const gt = await getGroundTruth(p.id);
    // Correct answer keeps consecutive_errors=0 so error_streak does not preempt
    const r = await http('POST', `/api/problems/${p.id}/submit`, {
      session_id: s.sessionId, submitted_answer: gt, time_spent_s: 30,
    }, s.cookie);
    if (r.status !== 200) return { ok: false, reason: `down submit: ${r.status} ${JSON.stringify(r.body)}` };
  }

  const downAfter = await getSkill(s.studentId, 'kcl');
  if (downAfter.tier !== expectedDown) {
    return { ok: false, reason: `down: tier ${downBefore.tier} → ${downAfter.tier} (expected ${expectedDown})` };
  }
  if (downAfter.consecutive_down !== 0) {
    return { ok: false, reason: `down: consecutive_down=${downAfter.consecutive_down} (expected 0 after demotion)` };
  }
  return { ok: true };
}

// ─── Runner ───────────────────────────────────────────────────────────────────

interface Scenario {
  id: number;
  name: string;
  run: () => Promise<ScenarioResult>;
}

const SCENARIOS: Scenario[] = [
  { id: 1, name: 'Idle',             run: scenarioIdle },
  { id: 2, name: 'Error streak',     run: scenarioErrorStreak },
  { id: 3, name: 'Hint budget',      run: scenarioHintBudget },
  { id: 4, name: 'Clean (negative)', run: scenarioClean },
  { id: 5, name: 'Checkin recalc',   run: scenarioCheckin },
  { id: 6, name: 'Tier up & down',   run: scenarioTierUpDown },
];

async function pingServer(): Promise<void> {
  try {
    // Hitting login with no body should yield a 400, which proves the server is up.
    await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
  } catch (err) {
    console.error(`\nCannot reach server at ${BASE_URL}.`);
    console.error(`Start it in another terminal:  npm run dev\n`);
    process.exit(1);
  }
}

async function main(): Promise<number> {
  await pingServer();
  console.log(`\nAdaptive system verification — ${RUNS_PER_SCENARIO} runs per scenario`);
  console.log(`Target: ${BASE_URL}\n`);

  const summary: Array<{ scenario: string; passed: number; failed: number; failures: string[] }> = [];

  for (const sc of SCENARIOS) {
    process.stdout.write(`S${sc.id} ${sc.name.padEnd(20)} `);
    let passed = 0;
    const failures: string[] = [];

    for (let i = 0; i < RUNS_PER_SCENARIO; i++) {
      try {
        const result = await sc.run();
        if (result.ok) {
          passed += 1;
          process.stdout.write('.');
        } else {
          failures.push(`run ${i + 1}: ${result.reason}`);
          process.stdout.write('F');
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        failures.push(`run ${i + 1}: threw — ${msg}`);
        process.stdout.write('E');
      }
    }

    const failed = RUNS_PER_SCENARIO - passed;
    process.stdout.write(`  ${passed}/${RUNS_PER_SCENARIO}\n`);
    summary.push({ scenario: `S${sc.id} ${sc.name}`, passed, failed, failures });
  }

  console.log('\n─── Summary ───────────────────────────────────────');
  for (const row of summary) {
    const tag = row.failed === 0 ? 'PASS' : 'FAIL';
    console.log(`${tag}  ${row.scenario.padEnd(24)} ${row.passed}/${RUNS_PER_SCENARIO}`);
  }

  const anyFailures = summary.some(s => s.failed > 0);
  if (anyFailures) {
    console.log('\n─── Failures ──────────────────────────────────────');
    for (const row of summary) {
      if (row.failed === 0) continue;
      console.log(`\n${row.scenario}:`);
      for (const f of row.failures) console.log(`  - ${f}`);
    }
  }

  const totalPassed = summary.reduce((acc, r) => acc + r.passed, 0);
  const totalRuns   = summary.length * RUNS_PER_SCENARIO;
  console.log(`\n${totalPassed}/${totalRuns} runs passed.`);

  return anyFailures ? 1 : 0;
}

main()
  .then(async (code) => {
    await pool.end().catch(() => undefined);
    await redis.quit().catch(() => undefined);
    process.exit(code);
  })
  .catch(async (err) => {
    console.error('\nFatal error:', err);
    await pool.end().catch(() => undefined);
    await redis.quit().catch(() => undefined);
    process.exit(1);
  });
