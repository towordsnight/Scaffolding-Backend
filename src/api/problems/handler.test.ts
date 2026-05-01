import { getProblem, getNextProblem, submitAnswer } from './handler';
import pool from '../../db/client';
import type { Response } from 'express';
import type { AuthRequest } from '../auth/middleware';

jest.mock('../../db/client', () => ({
  __esModule: true,
  default: { query: jest.fn(), connect: jest.fn() },
}));

jest.mock('../../redis/session-store', () => ({
  getSession: jest.fn().mockResolvedValue({ hints_used_this_problem: 0 }),
  setSession: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../services/skill-updater', () => ({
  updateSkillTier: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../services/cognitive-state', () => ({
  updateConsecutiveErrors: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../services/adaptive-engine', () => ({
  checkAfterSubmit: jest.fn().mockResolvedValue(null),
}));

const mockPool = pool as jest.Mocked<typeof pool>;

function makeRes(): jest.Mocked<Response> {
  const res = { status: jest.fn(), json: jest.fn() } as unknown as jest.Mocked<Response>;
  res.status.mockReturnValue(res);
  return res;
}

const fakeProblem = {
  id: 'p1',
  topic: 'kvl',
  difficulty: 'easy',
  problem_text: 'Find voltage drop.',
  error_taxonomy: ['sign_error'],
  created_at: new Date(),
};

beforeEach(() => jest.clearAllMocks());

// ── getProblem ─────────────────────────────────────────────────────────────────

describe('GET /api/problems/:id', () => {
  it('returns 404 when problem not found', async () => {
    (mockPool.query as jest.Mock).mockResolvedValue({ rows: [] });
    const req = { params: { id: 'missing' }, studentId: 'stu-1' } as unknown as AuthRequest;
    const res = makeRes();
    await getProblem(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 200 with problem data', async () => {
    (mockPool.query as jest.Mock).mockResolvedValue({ rows: [fakeProblem] });
    const req = { params: { id: 'p1' }, studentId: 'stu-1' } as unknown as AuthRequest;
    const res = makeRes();
    await getProblem(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(fakeProblem);
  });
});

// ── getNextProblem ─────────────────────────────────────────────────────────────

describe('GET /api/problems/next', () => {
  it('returns 400 when no skill vector found', async () => {
    (mockPool.query as jest.Mock).mockResolvedValue({ rows: [] });
    const req = { studentId: 'stu-1', body: {} } as unknown as AuthRequest;
    const res = makeRes();
    await getNextProblem(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 404 when no problem matches skill level', async () => {
    (mockPool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ topic: 'kvl', tier: 1 }] })
      .mockResolvedValueOnce({ rows: [] });
    const req = { studentId: 'stu-1', body: {} } as unknown as AuthRequest;
    const res = makeRes();
    await getNextProblem(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 200 with the weakest-topic problem', async () => {
    (mockPool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ topic: 'kvl', tier: 1 }, { topic: 'kcl', tier: 2 }] })
      .mockResolvedValueOnce({ rows: [fakeProblem] });
    const req = { studentId: 'stu-1', body: {} } as unknown as AuthRequest;
    const res = makeRes();
    await getNextProblem(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// ── submitAnswer ───────────────────────────────────────────────────────────────

describe('POST /api/problems/:id/submit', () => {
  it('returns 400 when required fields are missing', async () => {
    const req = { params: { id: 'p1' }, body: {}, studentId: 'stu-1' } as unknown as AuthRequest;
    const res = makeRes();
    await submitAnswer(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 404 when problem not found', async () => {
    (mockPool.query as jest.Mock).mockResolvedValue({ rows: [] });
    const req = {
      params: { id: 'missing' },
      body: { session_id: 's1', submitted_answer: 9, time_spent_s: 30 },
      studentId: 'stu-1',
    } as unknown as AuthRequest;
    const res = makeRes();
    await submitAnswer(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 200 with correct=true and intervention=null when within tolerance', async () => {
    (mockPool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ topic: 'kvl', ground_truth_answer: 9, tolerance: 0.01 }] })
      .mockResolvedValueOnce({ rows: [{ tier: 1 }] })
      .mockResolvedValueOnce({ rows: [] })  // INSERT attempt
      .mockResolvedValueOnce({ rows: [{ hint_budget: 3 }] })  // SELECT hint_budget
      .mockResolvedValue({ rows: [{ consecutive_errors: 0 }] });
    const req = {
      params: { id: 'p1' },
      body: { session_id: 's1', submitted_answer: 9, time_spent_s: 30 },
      studentId: 'stu-1',
    } as unknown as AuthRequest;
    const res = makeRes();
    await submitAnswer(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ correct: true, intervention: null }));
  });

  it('returns 200 with correct=false and intervention=null when outside tolerance', async () => {
    (mockPool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ topic: 'kvl', ground_truth_answer: 9, tolerance: 0.01 }] })
      .mockResolvedValueOnce({ rows: [{ tier: 1 }] })
      .mockResolvedValueOnce({ rows: [] })  // INSERT attempt
      .mockResolvedValueOnce({ rows: [{ hint_budget: 3 }] })  // SELECT hint_budget
      .mockResolvedValue({ rows: [{ consecutive_errors: 1 }] });
    const req = {
      params: { id: 'p1' },
      body: { session_id: 's1', submitted_answer: 5, time_spent_s: 30 },
      studentId: 'stu-1',
    } as unknown as AuthRequest;
    const res = makeRes();
    await submitAnswer(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ correct: false, intervention: null }));
  });
});
