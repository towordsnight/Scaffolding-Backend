import { createSession, heartbeat, getSessionState } from './handler';
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
