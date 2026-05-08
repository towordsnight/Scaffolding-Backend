import { createSession, heartbeat, getSessionState, endSession } from './handler';
import * as cognitiveState from '../../services/cognitive-state';
import * as adaptiveEngine from '../../services/adaptive-engine';
import pool from '../../db/client';
import * as sessionStore from '../../redis/session-store';
import type { Response } from 'express';
import type { AuthRequest } from '../auth/middleware';

jest.mock('../../db/client', () => ({
  __esModule: true,
  default: { query: jest.fn(), connect: jest.fn() },
}));

jest.mock('../../redis/session-store', () => ({
  getSession:  jest.fn().mockResolvedValue(null),
  setSession:  jest.fn().mockResolvedValue(undefined),
  extendTTL:   jest.fn().mockResolvedValue(undefined),
  deleteSession: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../services/adaptive-engine', () => ({
  checkIdleThreshold: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../services/cognitive-state', () => ({
  updateIdleStreak: jest.fn().mockResolvedValue(undefined),
}));

// redis/client is a transitive dep of session-store; mocking session-store prevents it from loading.

const mockPool   = pool as jest.Mocked<typeof pool>;
const mockStore  = sessionStore as jest.Mocked<typeof sessionStore>;

function makeRes(): jest.Mocked<Response> {
  const res = { status: jest.fn(), json: jest.fn(), end: jest.fn() } as unknown as jest.Mocked<Response>;
  res.status.mockReturnValue(res);
  return res;
}

beforeEach(() => jest.clearAllMocks());

// ── createSession ──────────────────────────────────────────────────────────────

describe('POST /api/sessions', () => {
  it('creates a session row and seeds Redis, returns 201', async () => {
    (mockPool.query as jest.Mock).mockResolvedValue({ rows: [{ id: 'sess-1' }] });

    const req = { body: {}, studentId: 'stu-1' } as unknown as AuthRequest;
    const res = makeRes();
    await createSession(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ session_id: 'sess-1' });
    expect(mockStore.setSession).toHaveBeenCalledWith('sess-1', expect.objectContaining({ hint_history: [] }));
  });
});

// ── heartbeat ─────────────────────────────────────────────────────────────────

describe('POST /api/sessions/:id/heartbeat', () => {
  it('returns 404 when session not found', async () => {
    (mockPool.query as jest.Mock).mockResolvedValue({ rows: [] });
    const req = { params: { id: 'sess-x' }, studentId: 'stu-1', body: {} } as unknown as AuthRequest;
    const res = makeRes();
    await heartbeat(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('extends TTL and returns 200 with intervention=null when session found', async () => {
    (mockPool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ id: 'sess-1' }] })
      .mockResolvedValue({ rows: [] });
    const req = { params: { id: 'sess-1' }, studentId: 'stu-1', body: {} } as unknown as AuthRequest;
    const res = makeRes();
    await heartbeat(req, res);
    expect(mockStore.extendTTL).toHaveBeenCalledWith('sess-1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ intervention: null });
  });

  it('calls updateIdleStreak when idle threshold is breached', async () => {
    (mockPool.query as jest.Mock).mockResolvedValue({ rows: [{ id: 'sess-1' }] });
    const idleTrigger = { type: 'idle', idleStreakS: 120 };
    (adaptiveEngine.checkIdleThreshold as jest.Mock).mockResolvedValueOnce(idleTrigger);
    const pastTime = new Date(Date.now() - 120_000).toISOString();
    mockStore.getSession.mockResolvedValueOnce({
      last_input_at: pastTime,
      idle_streak_seconds: 0,
      consecutive_errors: 0,
      hints_used_this_problem: 0,
      hint_history: [],
      current_problem_id: null,
      current_problem_state: { answer_draft: null, steps: [], last_modified: pastTime },
      last_seen_at: pastTime,
    });

    const req = { params: { id: 'sess-1' }, studentId: 'stu-1' } as unknown as AuthRequest;
    const res = makeRes();
    await heartbeat(req, res);

    expect(cognitiveState.updateIdleStreak).toHaveBeenCalledWith('stu-1', expect.any(Number));
    expect(res.json).toHaveBeenCalledWith({ intervention: idleTrigger });
  });

  it('does not call updateIdleStreak when not idle', async () => {
    (mockPool.query as jest.Mock).mockResolvedValue({ rows: [{ id: 'sess-1' }] });
    (adaptiveEngine.checkIdleThreshold as jest.Mock).mockResolvedValueOnce(null);
    const recentTime = new Date(Date.now() - 10_000).toISOString();
    mockStore.getSession.mockResolvedValueOnce({
      last_input_at: recentTime,
      idle_streak_seconds: 0,
      consecutive_errors: 0,
      hints_used_this_problem: 0,
      hint_history: [],
      current_problem_id: null,
      current_problem_state: { answer_draft: null, steps: [], last_modified: recentTime },
      last_seen_at: recentTime,
    });

    const req = { params: { id: 'sess-1' }, studentId: 'stu-1' } as unknown as AuthRequest;
    const res = makeRes();
    await heartbeat(req, res);

    expect(cognitiveState.updateIdleStreak).not.toHaveBeenCalled();
  });
});

// ── endSession ────────────────────────────────────────────────────────────────

describe('POST /api/sessions/:id/end', () => {
  function makeClient(updateRows: unknown[]) {
    const client = {
      query: jest.fn(),
      release: jest.fn(),
    };
    client.query
      .mockResolvedValueOnce({ rows: [] })             // BEGIN
      .mockResolvedValueOnce({ rows: updateRows })     // UPDATE sessions RETURNING id
      .mockResolvedValueOnce({ rows: [] })             // UPDATE students
      .mockResolvedValueOnce({ rows: [] });            // COMMIT
    return client;
  }

  it('returns 404 when session not found or already ended', async () => {
    const client = makeClient([]); // UPDATE returns 0 rows
    client.query
      .mockReset()
      .mockResolvedValueOnce({ rows: [] })  // BEGIN
      .mockResolvedValueOnce({ rows: [] })  // UPDATE sessions → 0 rows
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK
    (mockPool.connect as jest.Mock).mockResolvedValue(client);

    const req = { params: { id: 'sess-x' }, studentId: 'stu-1' } as unknown as AuthRequest;
    const res = makeRes();
    await endSession(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockStore.deleteSession).not.toHaveBeenCalled();
  });

  it('sets ended_at, increments sessions_completed, clears Redis, returns 200', async () => {
    const client = makeClient([{ id: 'sess-1' }]);
    (mockPool.connect as jest.Mock).mockResolvedValue(client);

    const req = { params: { id: 'sess-1' }, studentId: 'stu-1' } as unknown as AuthRequest;
    const res = makeRes();
    await endSession(req, res);

    // sessions UPDATE used RETURNING and matched
    const sessUpdate = client.query.mock.calls[1];
    expect(sessUpdate[0]).toContain('ended_at');
    expect(sessUpdate[1]).toEqual(['sess-1', 'stu-1']);

    // students UPDATE increments sessions_completed
    const stuUpdate = client.query.mock.calls[2];
    expect(stuUpdate[0]).toContain('sessions_completed');

    // Redis key cleared
    expect(mockStore.deleteSession).toHaveBeenCalledWith('sess-1');

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ended: true });
  });

  it('does not increment sessions_completed if called twice (second call gets 404)', async () => {
    // First call succeeds
    const client1 = makeClient([{ id: 'sess-1' }]);
    (mockPool.connect as jest.Mock).mockResolvedValueOnce(client1);
    const req = { params: { id: 'sess-1' }, studentId: 'stu-1' } as unknown as AuthRequest;
    await endSession(req, makeRes());

    // Second call: session already has ended_at set → UPDATE returns 0 rows
    const client2 = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [] })  // BEGIN
        .mockResolvedValueOnce({ rows: [] })  // UPDATE sessions → 0 rows (already ended)
        .mockResolvedValueOnce({ rows: [] }), // ROLLBACK
      release: jest.fn(),
    };
    (mockPool.connect as jest.Mock).mockResolvedValueOnce(client2);
    const res2 = makeRes();
    await endSession({ params: { id: 'sess-1' }, studentId: 'stu-1' } as unknown as AuthRequest, res2);

    expect(res2.status).toHaveBeenCalledWith(404);
    // students UPDATE was never called in the second attempt
    const client2Calls = client2.query.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(client2Calls.some(q => q.includes('sessions_completed'))).toBe(false);
  });
});

// ── getSessionState ────────────────────────────────────────────────────────────

describe('GET /api/sessions/:id', () => {
  it('returns 404 when session row not found', async () => {
    (mockPool.query as jest.Mock).mockResolvedValue({ rows: [] });
    const req = { params: { id: 'sess-x' }, studentId: 'stu-1', body: {} } as unknown as AuthRequest;
    const res = makeRes();
    await getSessionState(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 200 with session and Redis state', async () => {
    const sessionRow = { id: 'sess-1', current_problem_id: null, started_at: new Date(), last_seen_at: new Date() };
    const redisState = { hint_history: [], idle_streak_seconds: 0, consecutive_errors: 0, hints_used_this_problem: 0 };

    (mockPool.query as jest.Mock).mockResolvedValue({ rows: [sessionRow] });
    mockStore.getSession.mockResolvedValue(redisState as never);

    const req = { params: { id: 'sess-1' }, studentId: 'stu-1', body: {} } as unknown as AuthRequest;
    const res = makeRes();
    await getSessionState(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ session: sessionRow, state: redisState });
  });
});
