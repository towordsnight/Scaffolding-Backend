import 'dotenv/config';
import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { sessionKey } from '../src/redis/keys';

const BASE_URL = process.env.TEST_BASE_URL ?? `http://127.0.0.1:${process.env.PORT ?? '3000'}`;

type Cookie = string;
type StepType = 'planning' | 'mcq' | 'numeric' | 'open';

interface HttpResult<T = unknown> {
  status: number;
  body: T;
  cookie: Cookie | undefined;
}

interface ProblemSummary {
  id: string;
  topic: string;
  difficulty: string;
  problem_text: string;
}

interface ScaffoldOption {
  key: string;
  text: string;
  [key: string]: unknown;
}

interface ScaffoldStep {
  id: string;
  step_order: number;
  step_type: StepType;
  prompt_text: string;
  options: ScaffoldOption[] | null;
  [key: string]: unknown;
}

function createPool(): Pool {
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 4,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 2_000,
  });
}

function createRedis(): Redis {
  return new Redis(process.env.REDIS_URL as string, {
    maxRetriesPerRequest: 3,
    enableOfflineQueue: false,
  });
}

function requireEnv(names: string[]): void {
  const missing = names.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing required env vars for smoke test: ${missing.join(', ')}`);
  }
}

function section(title: string): void {
  console.log(`\n${'='.repeat(64)}`);
  console.log(`  ${title}`);
  console.log('='.repeat(64));
}

function pass(label: string, detail?: unknown): void {
  const suffix = detail === undefined ? '' : `  ${JSON.stringify(detail)}`;
  console.log(`  [PASS] ${label}${suffix}`);
}

function info(message: string): void {
  console.log(`         ${message}`);
}

function fail(label: string, status: number, body: unknown): never {
  console.error(`\n  [FAIL] ${label}  HTTP ${status}`);
  console.error(`         ${JSON.stringify(body)}`);
  process.exit(1);
}

function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function http<T = unknown>(
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
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let nextCookie: Cookie | undefined;
  const setCookieList =
    (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ??
    (res.headers.get('set-cookie') ? [res.headers.get('set-cookie') as string] : []);
  for (const entry of setCookieList) {
    if (entry.startsWith('token=')) nextCookie = entry.split(';')[0];
  }

  const text = await res.text();
  const parsed = text ? (JSON.parse(text) as T) : (null as T);
  return { status: res.status, body: parsed, cookie: nextCookie ?? cookie };
}

async function fetchProblemAnswers(pool: Pool, problemIds: string[]): Promise<Map<string, number>> {
  const result = await pool.query<{ id: string; ground_truth_answer: string }>(
    'SELECT id, ground_truth_answer::text FROM problems WHERE id = ANY($1)',
    [problemIds],
  );

  return new Map(result.rows.map((row) => [row.id, Number(row.ground_truth_answer)]));
}

async function findScaffoldProblem(pool: Pool, learnerProfile: string): Promise<string | null> {
  const result = await pool.query<{ id: string }>(
    `SELECT p.id
       FROM problems p
       JOIN problem_variants v ON v.problem_id = p.id
      WHERE p.topic = 'thevenin' AND v.learner_profile = $1
      ORDER BY p.created_at DESC
      LIMIT 1`,
    [learnerProfile],
  );

  return result.rows[0]?.id ?? null;
}

async function loadMcqAnswer(
  pool: Pool,
  stepId: string,
): Promise<{ stepType: StepType; correctOption: string | null }> {
  const result = await pool.query<{ step_type: StepType; options: Array<{ key: string; is_correct: boolean }> | null }>(
    'SELECT step_type, options FROM problem_steps WHERE id = $1',
    [stepId],
  );
  const row = result.rows[0];
  if (!row) throw new Error(`Missing problem step ${stepId}`);

  const correctOption = row.options?.find((option) => option.is_correct)?.key ?? null;
  return { stepType: row.step_type, correctOption };
}

async function main(): Promise<void> {
  requireEnv(['DATABASE_URL', 'REDIS_URL', 'JWT_SECRET']);

  const pool = createPool();
  const redis = createRedis();
  let cookie: Cookie | undefined;

  try {
    const email = `smoke+${randomUUID()}@adaptive.test`;
    const password = 'SmokePass123!';
    const learnerProfile = 'distracted';

    console.log('\nBalanced smoke test');
    console.log(`Target: ${BASE_URL}`);

    section('1  Health check');
    const health = await http<{ status: string }>('GET', '/health');
    if (health.status !== 200) fail('health', health.status, health.body);
    pass('server is up', health.body);

    section('2  Register and login cookie flow');
    const register = await http<{ id: string }>('POST', '/api/auth/register', {
      email,
      password,
      display_name: 'Balanced Smoke',
      course_level: 'intro',
      consent: true,
    });
    if (register.status !== 201) fail('register', register.status, register.body);
    ensure(register.cookie, 'register did not return an auth cookie');
    cookie = register.cookie;
    const studentId = register.body.id;
    pass('student created with auth cookie', { student_id: studentId });

    const login = await http<{ id: string }>('POST', '/api/auth/login', { email, password }, cookie);
    if (login.status !== 200) fail('login', login.status, login.body);
    ensure(login.cookie, 'login did not return an auth cookie');
    cookie = login.cookie;
    pass('login refreshed the auth cookie', { student_id: login.body.id });

    section('3  Onboarding declaration and adaptive config');
    const declaration = await http<{ declared: boolean }>('POST', '/api/onboarding/declaration', {
      adhd_flag: false,
      stress_baseline: 0,
      course_level: 'intro',
      learner_profile: learnerProfile,
    }, cookie);
    if (declaration.status !== 200) fail('declaration', declaration.status, declaration.body);
    pass('onboarding declaration accepted', declaration.body);

    const adaptiveConfig = await pool.query<{
      idle_threshold_s: number;
      error_threshold: number;
      hint_budget: number;
      response_length_budget: string;
    }>(
      `SELECT idle_threshold_s, error_threshold, hint_budget, response_length_budget
         FROM adaptive_config
        WHERE student_id = $1`,
      [studentId],
    );
    const config = adaptiveConfig.rows[0];
    ensure(config, `adaptive_config missing for ${studentId}`);
    ensure(
      config.idle_threshold_s === 90 &&
      config.error_threshold === 3 &&
      config.hint_budget === 3 &&
      config.response_length_budget === 'medium',
      `Unexpected adaptive_config ${JSON.stringify(config)}`,
    );
    pass('adaptive_config matches intro defaults', config);

    section('4  Diagnostic onboarding');
    const diagnosticProblems = await http<{ problems: ProblemSummary[] }>(
      'GET',
      '/api/onboarding/problems',
      undefined,
      cookie,
    );
    if (diagnosticProblems.status !== 200) {
      fail('get diagnostic problems', diagnosticProblems.status, diagnosticProblems.body);
    }
    ensure(diagnosticProblems.body.problems.length === 3, 'expected exactly 3 diagnostic problems');
    pass('fetched 3 diagnostic problems');

    const groundTruth = await fetchProblemAnswers(
      pool,
      diagnosticProblems.body.problems.map((problem) => problem.id),
    );
    ensure(groundTruth.size === 3, 'missing ground-truth answers for diagnostic problems');

    const answers = diagnosticProblems.body.problems.map((problem) => ({
      problem_id: problem.id,
      submitted_answer: groundTruth.get(problem.id),
      time_spent_s: 45,
    }));
    const diagnostic = await http<{
      completed: boolean;
      session_id: string;
      results: Array<{ topic: string; correct: boolean }>;
    }>('POST', '/api/onboarding/diagnostic', { answers }, cookie);
    if (diagnostic.status !== 200) fail('submit diagnostic', diagnostic.status, diagnostic.body);
    ensure(diagnostic.body.completed, 'diagnostic did not complete successfully');
    ensure(diagnostic.body.results.every((row) => row.correct), 'expected all diagnostic answers to grade correct');
    pass('diagnostic completed with correct submissions', {
      onboarding_session_id: diagnostic.body.session_id,
    });

    section('5  Session creation and next problem');
    const createSession = await http<{ session_id: string }>('POST', '/api/sessions', {}, cookie);
    if (createSession.status !== 201) fail('create session', createSession.status, createSession.body);
    const sessionId = createSession.body.session_id;
    pass('session row created', { session_id: sessionId });

    const sessionRaw = await redis.get(sessionKey(sessionId));
    ensure(sessionRaw, `Redis session not found for ${sessionId}`);
    const sessionState = JSON.parse(sessionRaw) as {
      current_problem_state: { steps: string[]; answer_draft: string | null };
      hint_history: unknown[];
      last_input_at: string;
    };
    ensure(Array.isArray(sessionState.hint_history), 'Redis session missing hint_history');
    ensure(typeof sessionState.last_input_at === 'string', 'Redis session missing last_input_at');
    pass('Redis session seeded for live session');

    const nextProblem = await http<ProblemSummary>('GET', '/api/problems/next', undefined, cookie);
    if (nextProblem.status !== 200) fail('get next problem', nextProblem.status, nextProblem.body);
    pass('next adaptive problem fetched', {
      id: nextProblem.body.id,
      topic: nextProblem.body.topic,
      difficulty: nextProblem.body.difficulty,
    });

    section('6  Scaffold smoke');
    const scaffoldProblemId = await findScaffoldProblem(pool, learnerProfile);
    if (!scaffoldProblemId) {
      info('No seeded Thevenin scaffold found for learner_profile=distracted. Skipping scaffold smoke.');
      return;
    }

    const scaffold = await http<{
      learner_profile: string;
      steps: ScaffoldStep[];
    }>('GET', `/api/problems/${scaffoldProblemId}/scaffold`, undefined, cookie);
    if (scaffold.status !== 200) fail('get scaffold', scaffold.status, scaffold.body);

    ensure(scaffold.body.learner_profile === learnerProfile, 'scaffold returned the wrong learner_profile');
    ensure(scaffold.body.steps.length > 0, 'scaffold returned no steps');
    for (const step of scaffold.body.steps) {
      ensure(!('ground_truth_answer' in step), 'scaffold leaked ground_truth_answer');
      for (const option of step.options ?? []) {
        ensure(!('is_correct' in option), 'scaffold leaked option.is_correct');
      }
    }
    pass('scaffold strips grading fields from public response', {
      steps: scaffold.body.steps.length,
    });

    const submitTarget =
      scaffold.body.steps.find((step) => step.step_type === 'planning' || step.step_type === 'open') ??
      scaffold.body.steps.find((step) => step.step_type === 'mcq') ??
      scaffold.body.steps[0];
    ensure(submitTarget, 'expected at least one scaffold step to submit');

    let submittedValue: string | number = 'smoke-check';
    if (submitTarget.step_type === 'mcq') {
      const dbStep = await loadMcqAnswer(pool, submitTarget.id);
      ensure(dbStep.correctOption, `No correct MCQ option found for step ${submitTarget.id}`);
      submittedValue = dbStep.correctOption;
    } else if (submitTarget.step_type === 'numeric') {
      submittedValue = 0;
    }

    const submitStep = await http<{
      correct: boolean | null;
      ungraded: boolean;
      misconception_hint: unknown;
    }>(
      'POST',
      `/api/problems/${scaffoldProblemId}/steps/${submitTarget.id}/submit`,
      {
        session_id: sessionId,
        submitted_value: submittedValue,
        time_spent_s: 12,
      },
      cookie,
    );
    if (submitStep.status !== 200) fail('submit scaffold step', submitStep.status, submitStep.body);
    ensure(submitStep.body.correct !== false, 'expected scaffold step submission not to grade false');
    pass('scaffold step submitted successfully', submitStep.body);

    const stepAttempt = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM problem_step_attempts
        WHERE session_id = $1 AND student_id = $2 AND step_id = $3`,
      [sessionId, studentId, submitTarget.id],
    );
    ensure(Number(stepAttempt.rows[0]?.count ?? 0) >= 1, 'problem_step_attempts row was not written');
    pass('problem_step_attempts audit row written');
  } finally {
    await Promise.allSettled([pool.end(), redis.quit()]);
  }
}

main().catch((err) => {
  console.error('\nSmoke test failed.');
  console.error(err);
  process.exit(1);
});
