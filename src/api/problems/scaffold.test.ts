import { getScaffold, submitStep } from './scaffold';
import pool from '../../db/client';
import type { Response } from 'express';
import type { AuthRequest } from '../auth/middleware';

jest.mock('../../db/client', () => ({
  __esModule: true,
  default: { query: jest.fn() },
}));

const mockPool = pool as jest.Mocked<typeof pool>;

function makeRes(): jest.Mocked<Response> {
  const res = { status: jest.fn(), json: jest.fn() } as unknown as jest.Mocked<Response>;
  res.status.mockReturnValue(res);
  return res;
}

beforeEach(() => jest.clearAllMocks());

// ── GET /api/problems/:id/scaffold ────────────────────────────────────────────

describe('GET /api/problems/:id/scaffold', () => {
  it('returns 400 when learner_profile is null', async () => {
    (mockPool.query as jest.Mock).mockResolvedValueOnce({ rows: [{ learner_profile: null }] });
    const req = { params: { id: 'p1' }, studentId: 'stu-1' } as unknown as AuthRequest;
    const res = makeRes();
    await getScaffold(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 404 when no variant exists for the profile', async () => {
    (mockPool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ learner_profile: 'starter' }] })
      .mockResolvedValueOnce({ rows: [] });
    const req = { params: { id: 'p1' }, studentId: 'stu-1' } as unknown as AuthRequest;
    const res = makeRes();
    await getScaffold(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 200 with steps and strips is_correct from mcq options', async () => {
    (mockPool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ learner_profile: 'distracted' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'v1' }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'step-1',
            step_order: 1,
            step_type: 'planning',
            prompt_text: 'Goal: find Vth, Rth.',
            options: null,
          },
          {
            id: 'step-2',
            step_order: 2,
            step_type: 'mcq',
            prompt_text: 'Pick a method.',
            options: [
              { key: 'A', text: 'Nodal', is_correct: true },
              { key: 'B', text: 'Mesh',  is_correct: false },
            ],
          },
        ],
      });

    const req = { params: { id: 'p1' }, studentId: 'stu-1' } as unknown as AuthRequest;
    const res = makeRes();
    await getScaffold(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = (res.json.mock.calls[0] as [unknown])[0] as {
      steps: Array<{ options: Array<{ key: string; text: string; is_correct?: boolean }> | null }>;
    };
    const mcqStep = payload.steps[1];
    expect(mcqStep.options).toEqual([
      { key: 'A', text: 'Nodal' },
      { key: 'B', text: 'Mesh'  },
    ]);
    for (const o of mcqStep.options ?? []) {
      expect(o).not.toHaveProperty('is_correct');
    }
    // ground_truth_answer must never appear
    const json = JSON.stringify(payload);
    expect(json).not.toMatch(/ground_truth_answer/);
    expect(json).not.toMatch(/is_correct/);
  });
});

// ── POST /api/problems/:id/steps/:stepId/submit ───────────────────────────────

describe('POST /api/problems/:id/steps/:stepId/submit', () => {
  it('returns 400 when required fields are missing', async () => {
    const req = {
      params: { id: 'p1', stepId: 'step-1' },
      body: {},
      studentId: 'stu-1',
    } as unknown as AuthRequest;
    const res = makeRes();
    await submitStep(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 404 when step does not belong to the problem', async () => {
    (mockPool.query as jest.Mock).mockResolvedValueOnce({ rows: [] });
    const req = {
      params: { id: 'p1', stepId: 'cross-step' },
      body: { session_id: 's1', submitted_value: 'A', time_spent_s: 5 },
      studentId: 'stu-1',
    } as unknown as AuthRequest;
    const res = makeRes();
    await submitStep(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('mcq: marks correct when chosen option.is_correct=true', async () => {
    (mockPool.query as jest.Mock)
      .mockResolvedValueOnce({
        rows: [{
          id: 'step-1',
          step_type: 'mcq',
          options: [
            { key: 'A', text: 'Nodal', is_correct: true },
            { key: 'B', text: 'Mesh',  is_correct: false },
          ],
          ground_truth_answer: null,
          tolerance: null,
        }],
      })
      .mockResolvedValueOnce({ rows: [] }); // INSERT
    const req = {
      params: { id: 'p1', stepId: 'step-1' },
      body: { session_id: 's1', submitted_value: 'A', time_spent_s: 4 },
      studentId: 'stu-1',
    } as unknown as AuthRequest;
    const res = makeRes();
    await submitStep(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ correct: true, ungraded: false }));
  });

  it('mcq: marks incorrect when chosen option.is_correct=false', async () => {
    (mockPool.query as jest.Mock)
      .mockResolvedValueOnce({
        rows: [{
          id: 'step-1',
          step_type: 'mcq',
          options: [
            { key: 'A', text: 'Nodal', is_correct: true  },
            { key: 'B', text: 'Mesh',  is_correct: false },
          ],
          ground_truth_answer: null,
          tolerance: null,
        }],
      })
      .mockResolvedValueOnce({ rows: [] });
    const req = {
      params: { id: 'p1', stepId: 'step-1' },
      body: { session_id: 's1', submitted_value: 'B', time_spent_s: 4 },
      studentId: 'stu-1',
    } as unknown as AuthRequest;
    const res = makeRes();
    await submitStep(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ correct: false, ungraded: false }));
  });

  it('numeric: marks correct within tolerance', async () => {
    (mockPool.query as jest.Mock)
      .mockResolvedValueOnce({
        rows: [{
          id: 'step-9',
          step_type: 'numeric',
          options: null,
          ground_truth_answer: 21.333,
          tolerance: 0.01,
        }],
      })
      .mockResolvedValueOnce({ rows: [] });
    const req = {
      params: { id: 'p1', stepId: 'step-9' },
      body: { session_id: 's1', submitted_value: 21.4, time_spent_s: 30 },
      studentId: 'stu-1',
    } as unknown as AuthRequest;
    const res = makeRes();
    await submitStep(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ correct: true }));
  });

  it('numeric: returns ungraded when ground_truth_answer is null', async () => {
    (mockPool.query as jest.Mock)
      .mockResolvedValueOnce({
        rows: [{
          id: 'step-vth',
          step_type: 'numeric',
          options: null,
          ground_truth_answer: null,
          tolerance: 0.01,
        }],
      })
      .mockResolvedValueOnce({ rows: [] });
    const req = {
      params: { id: 'p1', stepId: 'step-vth' },
      body: { session_id: 's1', submitted_value: 12.3, time_spent_s: 30 },
      studentId: 'stu-1',
    } as unknown as AuthRequest;
    const res = makeRes();
    await submitStep(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ correct: null, ungraded: true }));
  });

  it('planning: always marks correct=true', async () => {
    (mockPool.query as jest.Mock)
      .mockResolvedValueOnce({
        rows: [{
          id: 'step-0',
          step_type: 'planning',
          options: null,
          ground_truth_answer: null,
          tolerance: null,
        }],
      })
      .mockResolvedValueOnce({ rows: [] });
    const req = {
      params: { id: 'p1', stepId: 'step-0' },
      body: { session_id: 's1', submitted_value: 'ok', time_spent_s: 2 },
      studentId: 'stu-1',
    } as unknown as AuthRequest;
    const res = makeRes();
    await submitStep(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ correct: true }));
  });
});
