// The Anthropic SDK is mocked so hints tests don't require a live API key.
jest.mock('../../services/ai-tutor', () => ({
  streamHint: jest.fn(async function* () {
    yield 'Think about ';
    yield 'Kirchhoff\'s voltage law.';
    return { hintId: 'mock-hint-id', hintLevel: 1, hintDepth: 'socratic', responseBudget: 'medium' };
  }),
}));

import { truncateAll, seedProblem, registerAndLogin, pool } from '../../test/helpers';
import { clearStore } from '../../test/redisMock';

beforeEach(async () => {
  await truncateAll();
  clearStore();
});

afterAll(async () => {
  await pool.end();
});

// ── POST /api/hints ───────────────────────────────────────────────────────────

describe('POST /api/hints', () => {
  it('400 when session_id is missing', async () => {
    const problemId = await seedProblem();
    const agent = await registerAndLogin('h1@uw.edu');
    const res = await agent.post('/api/hints').send({ problem_id: problemId });
    expect(res.status).toBe(400);
  });

  it('400 when problem_id is missing', async () => {
    const agent = await registerAndLogin('h2@uw.edu');
    const sessRes = await agent.post('/api/sessions').send({});
    const { session_id } = sessRes.body as { session_id: string };
    const res = await agent.post('/api/hints').send({ session_id });
    expect(res.status).toBe(400);
  });

  it('404 when session does not exist', async () => {
    const problemId = await seedProblem();
    const agent = await registerAndLogin('h3@uw.edu');
    const res = await agent.post('/api/hints').send({
      session_id: '00000000-0000-0000-0000-000000000000',
      problem_id: problemId,
    });
    expect(res.status).toBe(404);
  });

  it('409 when hint budget is exhausted', async () => {
    const problemId = await seedProblem();
    const agent = await registerAndLogin('h4@uw.edu');
    const sessRes = await agent.post('/api/sessions').send({});
    const { session_id } = sessRes.body as { session_id: string };

    // Exhaust the budget (default = 3) by making 3 successful hint requests.
    for (let i = 0; i < 3; i++) {
      await agent.post('/api/hints').send({ session_id, problem_id: problemId });
    }

    // The 4th request should be rejected.
    const res = await agent.post('/api/hints').send({ session_id, problem_id: problemId });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/budget/i);
  });

  it('streams an SSE response on a valid request', async () => {
    const problemId = await seedProblem();
    const agent = await registerAndLogin('h5@uw.edu');
    const sessRes = await agent.post('/api/sessions').send({});
    const { session_id } = sessRes.body as { session_id: string };

    const res = await agent
      .post('/api/hints')
      .send({ session_id, problem_id: problemId })
      .buffer(true)   // collect the full streamed body
      .parse((res, callback) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => callback(null, data));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    // At least some SSE data was emitted.
    expect(typeof res.body).toBe('string');
    expect((res.body as string).length).toBeGreaterThan(0);
  });

  it('401 when not authenticated', async () => {
    const { default: request } = await import('supertest');
    const { default: app } = await import('../../app');
    const res = await request(app).post('/api/hints').send({
      session_id: 'x',
      problem_id: 'y',
    });
    expect(res.status).toBe(401);
  });
});
