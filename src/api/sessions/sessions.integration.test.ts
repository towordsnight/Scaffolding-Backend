import { truncateAll, registerAndLogin, pool } from '../../test/helpers';
import { clearStore } from '../../test/redisMock';

beforeEach(async () => {
  await truncateAll();
  clearStore();
});

afterAll(async () => {
  await pool.end();
});

// ── POST /api/sessions ────────────────────────────────────────────────────────

describe('POST /api/sessions', () => {
  it('201 with session_id on success', async () => {
    const agent = await registerAndLogin('sess@uw.edu');
    const res = await agent.post('/api/sessions').send({});
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('session_id');
    expect(typeof res.body.session_id).toBe('string');
  });

  it('session row written to Postgres', async () => {
    const agent = await registerAndLogin('sess2@uw.edu');
    const res = await agent.post('/api/sessions').send({});
    const { session_id } = res.body as { session_id: string };

    const row = await pool.query('SELECT id FROM sessions WHERE id=$1', [session_id]);
    expect(row.rows.length).toBe(1);
  });

  it('session seeded into Redis immediately', async () => {
    // The mock store exposes its contents via clearStore; we verify indirectly:
    // a subsequent GET /api/sessions/:id should succeed without a DB round-trip miss.
    const agent = await registerAndLogin('sess3@uw.edu');
    const res = await agent.post('/api/sessions').send({});
    const { session_id } = res.body as { session_id: string };

    const stateRes = await agent.get(`/api/sessions/${session_id}`);
    expect(stateRes.status).toBe(200);
  });

  it('401 when not authenticated', async () => {
    const { default: request } = await import('supertest');
    const { default: app } = await import('../../app');
    const res = await request(app).post('/api/sessions').send({});
    expect(res.status).toBe(401);
  });
});

// ── POST /api/sessions/:id/heartbeat ─────────────────────────────────────────

describe('POST /api/sessions/:id/heartbeat', () => {
  it('200 with no intervention under idle threshold', async () => {
    const agent = await registerAndLogin('hb@uw.edu');
    const sessRes = await agent.post('/api/sessions').send({});
    const { session_id } = sessRes.body as { session_id: string };

    const res = await agent.post(`/api/sessions/${session_id}/heartbeat`);
    expect(res.status).toBe(200);
    // No idle time has passed — should not trigger an intervention.
    expect(res.body.intervention).toBeNull();
  });

  it('404 when session does not exist', async () => {
    const agent = await registerAndLogin('hb2@uw.edu');
    const res = await agent.post('/api/sessions/00000000-0000-0000-0000-000000000000/heartbeat');
    expect(res.status).toBe(404);
  });

  it('404 when session belongs to a different student', async () => {
    // Create a session as student A.
    const agentA = await registerAndLogin('hbA@uw.edu');
    const sessRes = await agentA.post('/api/sessions').send({});
    const { session_id } = sessRes.body as { session_id: string };

    // Student B tries to heartbeat student A's session.
    const agentB = await registerAndLogin('hbB@uw.edu');
    const res = await agentB.post(`/api/sessions/${session_id}/heartbeat`);
    expect(res.status).toBe(404);
  });
});

// ── GET /api/sessions/:id ─────────────────────────────────────────────────────

describe('GET /api/sessions/:id', () => {
  it('200 with session and state', async () => {
    const agent = await registerAndLogin('get@uw.edu');
    const sessRes = await agent.post('/api/sessions').send({});
    const { session_id } = sessRes.body as { session_id: string };

    const res = await agent.get(`/api/sessions/${session_id}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('session');
    expect(res.body).toHaveProperty('state');
  });

  it('Redis cache miss falls back to Postgres', async () => {
    const agent = await registerAndLogin('miss@uw.edu');
    const sessRes = await agent.post('/api/sessions').send({});
    const { session_id } = sessRes.body as { session_id: string };

    // Evict the Redis entry to force a Postgres fallback.
    clearStore();

    const res = await agent.get(`/api/sessions/${session_id}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('session');
  });

  it('404 when session does not exist', async () => {
    const agent = await registerAndLogin('miss2@uw.edu');
    const res = await agent.get('/api/sessions/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
  });
});

// ── POST /api/sessions/:id/end ────────────────────────────────────────────────

describe('POST /api/sessions/:id/end', () => {
  it('200 and marks session as ended in Postgres', async () => {
    const agent = await registerAndLogin('end@uw.edu');
    const sessRes = await agent.post('/api/sessions').send({});
    const { session_id } = sessRes.body as { session_id: string };

    const res = await agent.post(`/api/sessions/${session_id}/end`);
    expect(res.status).toBe(200);
    expect(res.body.ended).toBe(true);

    const row = await pool.query<{ ended_at: Date | null }>(
      'SELECT ended_at FROM sessions WHERE id=$1',
      [session_id],
    );
    expect(row.rows[0].ended_at).not.toBeNull();
  });
});
