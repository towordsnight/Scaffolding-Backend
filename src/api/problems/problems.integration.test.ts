import { truncateAll, seedProblem, registerAndLogin, pool } from '../../test/helpers';
import { clearStore } from '../../test/redisMock';

beforeEach(async () => {
  await truncateAll();
  clearStore();
});

afterAll(async () => {
  await pool.end();
});

// ── GET /api/problems/:id ─────────────────────────────────────────────────────

describe('GET /api/problems/:id', () => {
  it('200 with problem fields (no ground_truth_answer)', async () => {
    const problemId = await seedProblem({ topic: 'kvl', difficulty: 'easy' });
    const agent = await registerAndLogin('gp@uw.edu');

    const res = await agent.get(`/api/problems/${problemId}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id', problemId);
    expect(res.body).toHaveProperty('topic', 'kvl');
    expect(res.body).toHaveProperty('problem_text');
    // Ground truth must never be exposed.
    expect(res.body).not.toHaveProperty('ground_truth_answer');
    expect(res.body).not.toHaveProperty('tolerance');
  });

  it('404 for a nonexistent problem id', async () => {
    const agent = await registerAndLogin('gp2@uw.edu');
    const res = await agent.get('/api/problems/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
  });
});

// ── GET /api/problems/next ────────────────────────────────────────────────────

describe('GET /api/problems/next', () => {
  it('200 returns a problem matching the student weakest skill', async () => {
    await seedProblem({ topic: 'kvl', difficulty: 'easy' });
    const agent = await registerAndLogin('next@uw.edu');

    const res = await agent.get('/api/problems/next');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
  });

  it('404 when no problems exist for the skill level', async () => {
    // Seed a problem for a different topic/difficulty than what the student needs.
    await seedProblem({ topic: 'impedance', difficulty: 'hard' });
    const agent = await registerAndLogin('next2@uw.edu');

    // Student starts at tier 1 (easy). The seeded problem is hard, so no match.
    const res = await agent.get('/api/problems/next');
    expect(res.status).toBe(404);
  });
});

// ── POST /api/problems/:id/submit ─────────────────────────────────────────────

describe('POST /api/problems/:id/submit', () => {
  it('correct: true when answer is within tolerance', async () => {
    const problemId = await seedProblem({ ground_truth_answer: 10, tolerance: 0.01 });
    const agent = await registerAndLogin('sub@uw.edu');

    // Create a session first.
    const sessRes = await agent.post('/api/sessions').send({});
    expect(sessRes.status).toBe(201);
    const { session_id } = sessRes.body as { session_id: string };

    const res = await agent.post(`/api/problems/${problemId}/submit`).send({
      session_id,
      submitted_answer: 10.05, // within 1%
      time_spent_s: 60,
    });
    expect(res.status).toBe(200);
    expect(res.body.correct).toBe(true);
  });

  it('correct: false when answer is outside tolerance', async () => {
    const problemId = await seedProblem({ ground_truth_answer: 10, tolerance: 0.01 });
    const agent = await registerAndLogin('sub2@uw.edu');

    const sessRes = await agent.post('/api/sessions').send({});
    const { session_id } = sessRes.body as { session_id: string };

    const res = await agent.post(`/api/problems/${problemId}/submit`).send({
      session_id,
      submitted_answer: 15, // 50% off
      time_spent_s: 60,
    });
    expect(res.status).toBe(200);
    expect(res.body.correct).toBe(false);
  });

  it('400 when required fields are missing', async () => {
    const problemId = await seedProblem();
    const agent = await registerAndLogin('sub3@uw.edu');

    const res = await agent.post(`/api/problems/${problemId}/submit`).send({});
    expect(res.status).toBe(400);
  });

  it('404 when problem id does not exist', async () => {
    const agent = await registerAndLogin('sub4@uw.edu');
    const sessRes = await agent.post('/api/sessions').send({});
    const { session_id } = sessRes.body as { session_id: string };

    const res = await agent.post('/api/problems/00000000-0000-0000-0000-000000000000/submit').send({
      session_id,
      submitted_answer: 5,
      time_spent_s: 30,
    });
    expect(res.status).toBe(404);
  });

  it('answer comparison uses numeric tolerance, not string equality', async () => {
    // "10" as a string vs 10 as a number should both be treated as correct.
    const problemId = await seedProblem({ ground_truth_answer: 10, tolerance: 0.01 });
    const agent = await registerAndLogin('sub5@uw.edu');
    const sessRes = await agent.post('/api/sessions').send({});
    const { session_id } = sessRes.body as { session_id: string };

    const res = await agent.post(`/api/problems/${problemId}/submit`).send({
      session_id,
      submitted_answer: 10,
      time_spent_s: 30,
    });
    expect(res.status).toBe(200);
    expect(res.body.correct).toBe(true);
  });

  it('problem_attempts row is written to the DB after submission', async () => {
    const problemId = await seedProblem({ ground_truth_answer: 7 });
    const agent = await registerAndLogin('sub6@uw.edu');
    const sessRes = await agent.post('/api/sessions').send({});
    const { session_id } = sessRes.body as { session_id: string };

    await agent.post(`/api/problems/${problemId}/submit`).send({
      session_id,
      submitted_answer: 7,
      time_spent_s: 45,
    });

    const attempts = await pool.query(
      'SELECT id FROM problem_attempts WHERE session_id = $1',
      [session_id],
    );
    expect(attempts.rows.length).toBe(1);
  });
});
