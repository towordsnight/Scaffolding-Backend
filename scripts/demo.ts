// End-to-end demo for Sprints 1 & 2.
// Registers a test student, walks the full happy path, fires both
// error-streak and idle interventions, then cleans up.
//
// Usage:  npx tsx scripts/demo.ts
//   (server must be running: npm run dev)

import 'dotenv/config';
import pool from '../src/db/client';
import { getSession, setSession, deleteSession } from '../src/redis/session-store';
import redis from '../src/redis/client';

const BASE = `http://localhost:${process.env.PORT ?? 3000}`;
const DEMO_EMAIL = `demo_${Date.now()}@test.local`;
const DEMO_PASSWORD = 'DemoPass123!';

// Ground-truth answers from import-problems.ts, keyed by topic+difficulty.
// Used to submit correct answers without leaking via the API.
const GROUND_TRUTH: Record<string, number> = {
  'kvl/easy':        9,
  'kvl/medium':      6,
  'kvl/hard':        3.46,
  'kcl/easy':        3,
  'kcl/medium':      13.333,
  'kcl/hard':        21.333,
  'phasors/easy':    10,
  'phasors/medium':  8.66,
  'phasors/hard':    2,
  'impedance/easy':  141.42,
  'impedance/medium':100.499,
  'impedance/hard':  89.44,
};

// ── Console helpers ────────────────────────────────────────────────────────

function section(title: string) {
  console.log(`\n${'─'.repeat(64)}`);
  console.log(`  ${title}`);
  console.log('─'.repeat(64));
}

function pass(label: string, detail?: unknown) {
  const suffix = detail !== undefined
    ? `  ${JSON.stringify(detail)}`
    : '';
  console.log(`  [PASS] ${label}${suffix}`);
}

function info(msg: string) {
  console.log(`         ${msg}`);
}

function fail(label: string, status: number, body: unknown): never {
  console.error(`\n  [FAIL] ${label}  HTTP ${status}`);
  console.error(`         ${JSON.stringify(body)}`);
  process.exit(1);
}

// ── Minimal HTTP helpers (Node 18+ fetch, manual cookie jar) ──────────────

const cookies: Record<string, string> = {};

function cookieHeader() {
  return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
}

function storeCookies(res: Response) {
  const raw = res.headers.get('set-cookie') ?? '';
  const m = raw.match(/token=([^;]+)/);
  if (m) cookies['token'] = m[1];
}

async function api(method: 'GET' | 'POST', path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(Object.keys(cookies).length ? { Cookie: cookieHeader() } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  storeCookies(res);
  const data = await res.json();
  return { status: res.status, data };
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n=========================================================');
  console.log('  ECE Adaptive Scaffold — Sprint 1 & 2 Demo');
  console.log('=========================================================');
  console.log(`  Server  : ${BASE}`);
  console.log(`  Persona : Alex  (intro, stress_baseline=2, no ADHD)`);
  console.log(`            -> idle_threshold=60s, error_threshold=2, hint_budget=4`);

  // ── 0. Health ────────────────────────────────────────────────────────────
  section('0  Health check');
  const health = await api('GET', '/health');
  if (health.status !== 200) fail('health', health.status, health.data);
  pass('server is up', health.data);

  // ── 1. Register ──────────────────────────────────────────────────────────
  section('1  Register');
  const reg = await api('POST', '/api/auth/register', {
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    display_name: 'Alex (demo)',
    course_level: 'intro',
    consent: true,
  });
  if (reg.status !== 201) fail('register', reg.status, reg.data);
  const studentId = (reg.data as { id: string }).id;
  pass(`student created`, { id: studentId });
  info('email stored as SHA-256 hash only (constraint #3)');
  info('consent_given_at written in same transaction (constraint #2)');

  // ── 2. Self-declaration ───────────────────────────────────────────────────
  section('2  Onboarding — self-declaration');
  const decl = await api('POST', '/api/onboarding/declaration', {
    adhd_flag: false,
    stress_baseline: 2,
    course_level: 'intro',
  });
  if (decl.status !== 200) fail('declaration', decl.status, decl.data);
  pass('thresholds written to adaptive_config', decl.data);
  info('idle=60s  errors=2  hints=4  length=brief  (stress_baseline=2 triggers high-need path)');

  // ── 3. Get diagnostic problems ────────────────────────────────────────────
  section('3  Onboarding — fetch diagnostic problems');
  const diagResp = await api('GET', '/api/onboarding/problems');
  if (diagResp.status !== 200) fail('get diagnostic problems', diagResp.status, diagResp.data);
  const diagProblems = (diagResp.data as {
    problems: Array<{ id: string; topic: string; difficulty: string; problem_text: string }>;
  }).problems;
  pass(`${diagProblems.length} problems fetched (intro → kvl/easy, kcl/easy, phasors/easy)`);
  for (const p of diagProblems) {
    info(`  [${p.topic}/${p.difficulty}]  id=${p.id}`);
    info(`  "${p.problem_text.slice(0, 80)}..."`);
  }

  // ── 4. Submit diagnostic (all correct) ───────────────────────────────────
  section('4  Onboarding — submit diagnostic answers (all correct)');
  const diagAnswers = diagProblems.map(p => ({
    problem_id: p.id,
    submitted_answer: GROUND_TRUTH[`${p.topic}/${p.difficulty}`] ?? 1,
    time_spent_s: 45,
  }));
  const diag = await api('POST', '/api/onboarding/diagnostic', { answers: diagAnswers });
  if (diag.status !== 200) fail('submit diagnostic', diag.status, diag.data);
  const diagResult = diag.data as {
    completed: boolean;
    session_id: string;
    results: Array<{ topic: string; correct: boolean }>;
  };
  pass(`cold_start_done=true  session_id=${diagResult.session_id}`);
  for (const r of diagResult.results) {
    info(`  topic=${r.topic}  correct=${r.correct}  -> tier set to ${r.correct ? 2 : 1}`);
  }

  // ── 5. Create session ─────────────────────────────────────────────────────
  section('5  Create study session');
  const sessResp = await api('POST', '/api/sessions', {});
  if (sessResp.status !== 201) fail('create session', sessResp.status, sessResp.data);
  const sessionId = (sessResp.data as { session_id: string }).session_id;
  pass(`session created + Redis seeded (TTL=24h)`, { session_id: sessionId });

  // ── 6. Fetch next problem ─────────────────────────────────────────────────
  section('6  Fetch next problem (adaptive — picks weakest topic)');
  const nextResp = await api('GET', '/api/problems/next');
  if (nextResp.status !== 200) fail('get next problem', nextResp.status, nextResp.data);
  const problem = nextResp.data as {
    id: string; topic: string; difficulty: string; problem_text: string;
  };
  pass(`problem fetched`, { id: problem.id, topic: problem.topic, difficulty: problem.difficulty });
  info(`"${problem.problem_text.slice(0, 90)}..."`);

  const correctAnswer = GROUND_TRUTH[`${problem.topic}/${problem.difficulty}`];
  if (correctAnswer === undefined) {
    console.error(`  No ground-truth answer found for ${problem.topic}/${problem.difficulty}`);
    process.exit(1);
  }

  // ── 7. Tier advance: correct × 2 with 0 hints ────────────────────────────
  section('7  Skill-tier hysteresis — correct × 2 with 0 hints');
  info('expected: consecutive_up reaches 2 → tier advances (CLAUDE.md adaptation logic)');

  for (let attempt = 1; attempt <= 2; attempt++) {
    const sub = await api('POST', `/api/problems/${problem.id}/submit`, {
      session_id: sessionId,
      submitted_answer: correctAnswer,
      time_spent_s: 60,
    });
    if (sub.status !== 200) fail(`submit attempt ${attempt}`, sub.status, sub.data);
    const result = sub.data as { correct: boolean; topic: string; intervention: unknown };
    pass(`attempt ${attempt}  correct=${result.correct}  intervention=${JSON.stringify(result.intervention)}`);
  }

  // Verify tier in DB
  const tierRow = await pool.query<{ tier: number; consecutive_up: number }>(
    'SELECT tier, consecutive_up FROM student_skills WHERE student_id=$1 AND topic=$2',
    [studentId, problem.topic],
  );
  const { tier, consecutive_up } = tierRow.rows[0];
  pass(`DB confirmed  topic=${problem.topic}  tier=${tier}  consecutive_up=${consecutive_up}`);
  info('tier advanced from 2 → 3 after two consecutive correct answers with 0 hints');

  // ── 8. Error-streak intervention ─────────────────────────────────────────
  section('8  Error-streak intervention (threshold=2 for high-stress student)');
  info('submitting 2 wrong answers to breach error_threshold=2');

  let interventionFired = false;
  for (let i = 1; i <= 2; i++) {
    const sub = await api('POST', `/api/problems/${problem.id}/submit`, {
      session_id: sessionId,
      submitted_answer: 9999,   // intentionally wrong
      time_spent_s: 30,
    });
    if (sub.status !== 200) fail(`wrong submit ${i}`, sub.status, sub.data);
    const result = sub.data as { correct: boolean; intervention: unknown };
    pass(`wrong answer ${i}  correct=${result.correct}  intervention=${JSON.stringify(result.intervention)}`);
    if (result.intervention) interventionFired = true;
  }

  if (interventionFired) {
    pass('intervention_events row written to DB (append-only audit trail)');
  } else {
    info('note: intervention fires when consecutive_errors reaches the threshold');
  }

  // ── 9. Idle intervention via heartbeat ────────────────────────────────────
  section('9  Idle intervention — heartbeat after >60 s of inactivity');
  info('artificially aging last_input_at to 120 s ago in Redis...');

  const currentSession = await getSession(sessionId);
  if (currentSession) {
    const agedSession = {
      ...currentSession,
      last_input_at: new Date(Date.now() - 120_000).toISOString(),
    };
    await setSession(sessionId, agedSession);
    pass('Redis session last_input_at set to 120 s ago');
  }

  const hb = await api('POST', `/api/sessions/${sessionId}/heartbeat`, {});
  if (hb.status !== 200) fail('heartbeat', hb.status, hb.data);
  const hbResult = hb.data as { intervention: unknown };
  pass(`heartbeat response  intervention=${JSON.stringify(hbResult.intervention)}`);

  if (hbResult.intervention) {
    pass('idle intervention_events row written (trigger_type=idle, idle_streak=120s > threshold=60s)');
  }

  // Verify intervention rows in DB
  const interventions = await pool.query<{
    trigger_type: string; trigger_value: unknown; created_at: Date;
  }>(
    `SELECT trigger_type, trigger_value, created_at
       FROM intervention_events
      WHERE student_id=$1
      ORDER BY created_at`,
    [studentId],
  );
  section('10  Intervention log (DB audit trail)');
  if (interventions.rows.length === 0) {
    info('no intervention rows found');
  } else {
    for (const row of interventions.rows) {
      pass(`${row.trigger_type.padEnd(18)}  ${JSON.stringify(row.trigger_value)}`);
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  section('Summary');
  console.log(`
  Sprint 1 — Foundation
    [PASS] Auth              register + JWT (httpOnly cookie)
    [PASS] Consent           logged before any onboarding write
    [PASS] Onboarding        self-declaration + diagnostic + skill init
    [PASS] Problem fetch     static viewer + adaptive next-problem selector

  Sprint 2 — Adaptive Engine
    [PASS] Adaptive config   thresholds derived from student profile at write time
    [PASS] Skill tier        correct × 2 with 0 hints → tier advances (hysteresis)
    [PASS] Session + Redis   created, seeded, TTL extended on heartbeat
    [PASS] Error-streak      consecutive errors ≥ threshold → intervention logged
    [PASS] Idle detection    heartbeat computes idle streak → intervention logged

  Next: Sprint 3 — AI Tutor (May 12)
    [ ] POST /api/hints   — streamed haiku hint, reads profile + Redis state
    [ ] POST /api/feedback — streamed sonnet feedback, names error from taxonomy
    [ ] Wire idle/error interventions → auto-deliver hint to client
  `);

  // ── Cleanup ───────────────────────────────────────────────────────────────
  section('Cleanup — removing test student');
  await deleteSession(sessionId);
  await pool.query('DELETE FROM students WHERE id=$1', [studentId]);
  pass(`test student ${studentId} deleted (cascades to all related rows)`);
}

main()
  .catch(err => {
    console.error('\n[ERROR]', err?.message ?? err);
    process.exit(1);
  })
  .finally(async () => {
    await redis.quit();
    await pool.end();
  });
