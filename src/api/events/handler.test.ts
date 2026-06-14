import { logEvent } from './handler';
import pool from '../../db/client';
import type { Response } from 'express';
import type { AuthRequest } from '../auth/middleware';

jest.mock('../../db/client', () => ({
  __esModule: true,
  default: { query: jest.fn(), connect: jest.fn() },
}));

jest.mock('../../db/queries/sessions', () => ({
  sessionBelongsToStudent: jest.fn().mockResolvedValue(true),
}));

import { sessionBelongsToStudent } from '../../db/queries/sessions';
const mockSessionOwned = sessionBelongsToStudent as jest.MockedFunction<typeof sessionBelongsToStudent>;

const mockPool = pool as jest.Mocked<typeof pool>;

function makeRes(): jest.Mocked<Response> {
  const res = { status: jest.fn(), json: jest.fn(), end: jest.fn() } as unknown as jest.Mocked<Response>;
  res.status.mockReturnValue(res);
  return res;
}

function makeReq(body: Record<string, unknown>): AuthRequest {
  return { body, studentId: 'stu-1' } as AuthRequest;
}

beforeEach(() => {
  jest.clearAllMocks();
  (mockPool.query as jest.Mock).mockResolvedValue({ rows: [] });
});

describe('POST /api/events', () => {
  it('returns 400 when event_type is missing', async () => {
    const res = makeRes();
    await logEvent(makeReq({ payload: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 for unknown event_type', async () => {
    const res = makeRes();
    await logEvent(makeReq({ event_type: 'unknown', payload: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 404 when the payload session belongs to another student', async () => {
    mockSessionOwned.mockResolvedValueOnce(false);
    const res = makeRes();
    await logEvent(makeReq({
      event_type: 'problem_attempt',
      payload: { session_id: 's-other', problem_id: 'p1', outcome: true, time_spent_s: 30 },
    }), res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  it('inserts problem_attempt and returns 204', async () => {
    const res = makeRes();
    await logEvent(makeReq({
      event_type: 'problem_attempt',
      payload: { session_id: 's1', problem_id: 'p1', outcome: true, time_spent_s: 30, skill_tier_at_attempt: 1 },
    }), res);
    expect(mockPool.query).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(204);
  });

  it('inserts hint_event and returns 204', async () => {
    const res = makeRes();
    await logEvent(makeReq({
      event_type: 'hint_event',
      payload: { session_id: 's1', problem_id: 'p1', hint_level: 1, hint_depth: 'socratic', absorbed: true },
    }), res);
    expect(res.status).toHaveBeenCalledWith(204);
  });

  it('inserts intervention_event and returns 204', async () => {
    const res = makeRes();
    await logEvent(makeReq({
      event_type: 'intervention_event',
      payload: { session_id: 's1', trigger_type: 'idle', trigger_value: {}, response_type: 'hint' },
    }), res);
    expect(res.status).toHaveBeenCalledWith(204);
  });

  it('inserts state_snapshot and returns 204', async () => {
    const res = makeRes();
    await logEvent(makeReq({
      event_type: 'state_snapshot',
      payload: { session_id: 's1', stress_level: 1, focus_quality: 0.7, trigger: 'checkin' },
    }), res);
    expect(res.status).toHaveBeenCalledWith(204);
  });

  it('inserts checkin_response and returns 204', async () => {
    const res = makeRes();
    await logEvent(makeReq({
      event_type: 'checkin_response',
      payload: { session_id: 's1', question_key: 'stress', numeric_value: 2 },
    }), res);
    expect(res.status).toHaveBeenCalledWith(204);
  });
});
