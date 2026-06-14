import { truncateAll, seedProblem, registerAndLogin, pool } from '../../test/helpers';
import { clearStore } from '../../test/redisMock';
import request from 'supertest';
import app from '../../app';

beforeEach(async () => {
  await truncateAll();
  clearStore();
});

afterAll(async () => {
  await pool.end();
});

// ── Consent ───────────────────────────────────────────────────────────────────

describe('POST /api/onboarding/consent', () => {
  it('200 + consented:true when consent=true', async () => {
    // Register without consent so we can test the consent endpoint separately.
    const agent = request.agent(app);
    await agent.post('/api/auth/register').send({ email: 'c@uw.edu', password: 'pw' });

    const res = await agent.post('/api/onboarding/consent').send({ consent: true });
    expect(res.status).toBe(200);
    expect(res.body.consented).toBe(true);
  });

  it('200 + consented:false when consent=false (logs refusal, does not gate)', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/register').send({ email: 'nc@uw.edu', password: 'pw' });

    const res = await agent.post('/api/onboarding/consent').send({ consent: false });
    expect(res.status).toBe(200);
    expect(res.body.consented).toBe(false);
  });

  it('400 when consent field is missing', async () => {
    const agent = await registerAndLogin('f@uw.edu');
    const res = await agent.post('/api/onboarding/consent').send({});
    expect(res.status).toBe(400);
  });

  it('400 when consent is not a boolean', async () => {
    const agent = await registerAndLogin('nb@uw.edu');
    const res = await agent.post('/api/onboarding/consent').send({ consent: 'yes' });
    expect(res.status).toBe(400);
  });

  it('401 when not authenticated', async () => {
    const res = await request(app).post('/api/onboarding/consent').send({ consent: true });
    expect(res.status).toBe(401);
  });
});

// ── Declaration ───────────────────────────────────────────────────────────────

describe('POST /api/onboarding/declaration', () => {
  it('403 when consent has not been given', async () => {
    // Register without consent (consent: false or consent missing).
    const agent = request.agent(app);
    await agent.post('/api/auth/register').send({ email: 'nodecl@uw.edu', password: 'pw' });
    // Do not call the consent endpoint — consent_given_at stays NULL.

    const res = await agent.post('/api/onboarding/declaration').send({
      adhd_flag: false,
      stress_baseline: 1,
      course_level: 'intro',
    });
    expect(res.status).toBe(403);
  });

  it('400 when required fields are missing', async () => {
    const agent = await registerAndLogin('decl2@uw.edu');
    const res = await agent.post('/api/onboarding/declaration').send({});
    expect(res.status).toBe(400);
  });

  it('400 when stress_baseline is out of range', async () => {
    const agent = await registerAndLogin('decl3@uw.edu');
    const res = await agent.post('/api/onboarding/declaration').send({
      adhd_flag: false,
      stress_baseline: 5,
      course_level: 'intro',
    });
    expect(res.status).toBe(400);
  });

  it('200 + declared:true on happy path (consent already given at register)', async () => {
    // registerAndLogin sends consent:true, so consent_given_at is set.
    const agent = await registerAndLogin('decl4@uw.edu');
    const res = await agent.post('/api/onboarding/declaration').send({
      adhd_flag: false,
      stress_baseline: 1,
      course_level: 'intro',
    });
    expect(res.status).toBe(200);
    expect(res.body.declared).toBe(true);
  });
});

// ── Diagnostic problems ───────────────────────────────────────────────────────

describe('GET /api/onboarding/problems', () => {
  it('200 with 3 problems after consent', async () => {
    // Seed problems for all topics used by intro diagnostics: kvl, kcl, phasors.
    await seedProblem({ topic: 'kvl', difficulty: 'easy' });
    await seedProblem({ topic: 'kcl', difficulty: 'easy' });
    await seedProblem({ topic: 'phasors', difficulty: 'easy' });

    const agent = await registerAndLogin('diag@uw.edu');
    const res = await agent.get('/api/onboarding/problems');
    expect(res.status).toBe(200);
    expect(res.body.problems).toHaveLength(3);
  });

  it('503 when problem bank is empty', async () => {
    const agent = await registerAndLogin('diag2@uw.edu');
    const res = await agent.get('/api/onboarding/problems');
    expect(res.status).toBe(503);
  });

  it('403 when consent was not given', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/register').send({ email: 'nocon@uw.edu', password: 'pw' });
    const res = await agent.get('/api/onboarding/problems');
    expect(res.status).toBe(403);
  });
});

// ── Full onboarding flow ──────────────────────────────────────────────────────

describe('Full onboarding happy path', () => {
  it('register → get problems → submit diagnostic → cold_start_done = true', async () => {
    await seedProblem({ topic: 'kvl', difficulty: 'easy', ground_truth_answer: 10 });
    await seedProblem({ topic: 'kcl', difficulty: 'easy', ground_truth_answer: 5 });
    await seedProblem({ topic: 'phasors', difficulty: 'easy', ground_truth_answer: 3 });

    const agent = await registerAndLogin('full@uw.edu');

    // Get the 3 diagnostic problems.
    const problemsRes = await agent.get('/api/onboarding/problems');
    expect(problemsRes.status).toBe(200);
    const problems = problemsRes.body.problems as Array<{ id: string }>;
    expect(problems).toHaveLength(3);

    // Submit answers (any numeric values).
    const answers = problems.map((p) => ({
      problem_id: p.id,
      submitted_answer: 10,
      time_spent_s: 30,
    }));

    const diagRes = await agent
      .post('/api/onboarding/diagnostic')
      .send({ answers });
    expect(diagRes.status).toBe(200);
    expect(diagRes.body.completed).toBe(true);
    expect(diagRes.body.results).toHaveLength(3);

    // Verify cold_start_done was set in the DB.
    const dbCheck = await pool.query<{ cold_start_done: boolean }>(
      `SELECT s.cold_start_done
       FROM students s
       JOIN consent_log cl ON cl.student_id = s.id
       WHERE s.cold_start_done = TRUE
       LIMIT 1`,
    );
    expect(dbCheck.rows.length).toBeGreaterThan(0);
  });

  it('409 when diagnostic is submitted a second time', async () => {
    await seedProblem({ topic: 'kvl', difficulty: 'easy' });
    await seedProblem({ topic: 'kcl', difficulty: 'easy' });
    await seedProblem({ topic: 'phasors', difficulty: 'easy' });

    const agent = await registerAndLogin('twice@uw.edu');

    const problemsRes = await agent.get('/api/onboarding/problems');
    const problems = problemsRes.body.problems as Array<{ id: string }>;
    const answers = problems.map((p) => ({ problem_id: p.id, submitted_answer: 1, time_spent_s: 10 }));

    await agent.post('/api/onboarding/diagnostic').send({ answers });

    // Second submission should be rejected.
    const res2 = await agent.post('/api/onboarding/diagnostic').send({ answers });
    expect(res2.status).toBe(409);
  });
});
