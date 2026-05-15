import { postHint } from './handler';
import pool from '../../db/client';
import { getSession, setSession } from '../../redis/session-store';
import { streamHint } from '../../services/ai-tutor';
import type { Response } from 'express';
import type { AuthRequest } from '../auth/middleware';
import { EventEmitter } from 'events';

jest.mock('../../db/client', () => ({
  __esModule: true,
  default: { query: jest.fn() },
}));

jest.mock('../../redis/session-store', () => ({
  getSession: jest.fn(),
  setSession: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../services/ai-tutor', () => ({
  streamHint: jest.fn(),
}));

const mockPool = pool as jest.Mocked<typeof pool>;
const mockGetSession = getSession as jest.MockedFunction<typeof getSession>;
const mockSetSession = setSession as jest.MockedFunction<typeof setSession>;
const mockStreamHint = streamHint as jest.MockedFunction<typeof streamHint>;

function makeReq(body: Record<string, unknown> = {}, studentId = 'stu-1'): AuthRequest & EventEmitter {
  const req = new EventEmitter() as AuthRequest & EventEmitter;
  req.body = body;
  req.studentId = studentId;
  return req;
}

function makeRes(): jest.Mocked<Response> & { _chunks: string[] } {
  const res = {
    _chunks: [] as string[],
    setHeader: jest.fn(),
    flushHeaders: jest.fn(),
    status: jest.fn(),
    json: jest.fn(),
    write: jest.fn(),
    end: jest.fn(),
  } as unknown as jest.Mocked<Response> & { _chunks: string[] };
  res.status.mockReturnValue(res);
  (res.write as jest.Mock).mockImplementation((chunk: string) => { res._chunks.push(chunk); return true; });
  return res;
}

async function* fakeHintGen(tokens: string[], ctx: { hintId: string; hintLevel: number; hintDepth: 'socratic' | 'concrete'; responseBudget: 'short' | 'brief' | 'medium' }) {
  for (const t of tokens) yield t;
  return ctx;
}

const baseSession = {
  current_problem_id: 'p1',
  current_problem_state: { answer_draft: null, steps: [], last_modified: new Date().toISOString() },
  hint_history: [],
  last_input_at: new Date().toISOString(),
  last_seen_at: new Date().toISOString(),
  idle_streak_seconds: 0,
  consecutive_errors: 0,
  hints_used_this_problem: 0,
};

beforeEach(() => jest.clearAllMocks());

describe('POST /api/hints', () => {
  it('returns 400 when required fields are missing', async () => {
    const req = makeReq({});
    const res = makeRes();
    await postHint(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 404 when session is missing', async () => {
    mockGetSession.mockResolvedValue(null);
    const req = makeReq({ session_id: 's1', problem_id: 'p1' });
    const res = makeRes();
    await postHint(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 409 when hint budget is exhausted and trigger is not hint_budget_exhausted', async () => {
    mockGetSession.mockResolvedValue({ ...baseSession, hints_used_this_problem: 3 });
    (mockPool.query as jest.Mock).mockResolvedValueOnce({ rows: [{ hint_budget: 3 }] });
    const req = makeReq({ session_id: 's1', problem_id: 'p1', trigger_type: 'manual' });
    const res = makeRes();
    await postHint(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('streams tokens as SSE frames and emits a done event', async () => {
    mockGetSession.mockResolvedValue(baseSession);
    (mockPool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ hint_budget: 3 }] }) // budget check
      .mockResolvedValueOnce({ rows: [] });                  // INSERT hint_events
    mockStreamHint.mockReturnValue(
      fakeHintGen(['Try ', 'KCL ', 'at node A.'], {
        hintId: 'h-uuid', hintLevel: 1, hintDepth: 'socratic', responseBudget: 'medium',
      }) as ReturnType<typeof streamHint>,
    );

    const req = makeReq({ session_id: 's1', problem_id: 'p1', trigger_type: 'manual' });
    const res = makeRes();
    await postHint(req, res);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
    expect(res.flushHeaders).toHaveBeenCalled();

    const allChunks = res._chunks.join('');
    expect(allChunks).toContain('data: {"token":"Try "}');
    expect(allChunks).toContain('data: {"token":"KCL "}');
    expect(allChunks).toContain('data: {"token":"at node A."}');
    expect(allChunks).toContain('event: done');
    expect(allChunks).toContain('"hint_id":"h-uuid"');
    expect(res.end).toHaveBeenCalled();
  });

  it('inserts a hint_events row and updates Redis hint_history after stream completes', async () => {
    mockGetSession.mockResolvedValue(baseSession);
    (mockPool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ hint_budget: 3 }] })
      .mockResolvedValueOnce({ rows: [] });
    mockStreamHint.mockReturnValue(
      fakeHintGen(['ok'], {
        hintId: 'h-uuid', hintLevel: 1, hintDepth: 'concrete', responseBudget: 'short',
      }) as ReturnType<typeof streamHint>,
    );

    const req = makeReq({ session_id: 's1', problem_id: 'p1', trigger_type: 'idle' });
    const res = makeRes();
    await postHint(req, res);

    const insertCall = (mockPool.query as jest.Mock).mock.calls[1];
    expect((insertCall[0] as string)).toContain('INSERT INTO hint_events');
    expect(insertCall[1]).toEqual(['s1', 'p1', 'stu-1', 1, 'concrete']);

    expect(mockSetSession).toHaveBeenCalledWith('s1', expect.objectContaining({
      hints_used_this_problem: 1,
      hint_history: [expect.objectContaining({ hint_id: 'h-uuid', hint_level: 1, absorbed: false })],
    }));
  });

  it('allows a hint when triggerType=hint_budget_exhausted even at the cap', async () => {
    mockGetSession.mockResolvedValue({ ...baseSession, hints_used_this_problem: 3 });
    (mockPool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ hint_budget: 3 }] })
      .mockResolvedValueOnce({ rows: [] });
    mockStreamHint.mockReturnValue(
      fakeHintGen(['Final.'], {
        hintId: 'h2', hintLevel: 4, hintDepth: 'concrete', responseBudget: 'medium',
      }) as ReturnType<typeof streamHint>,
    );

    const req = makeReq({ session_id: 's1', problem_id: 'p1', trigger_type: 'hint_budget_exhausted' });
    const res = makeRes();
    await postHint(req, res);

    expect(res.status).not.toHaveBeenCalledWith(409);
    expect(res.end).toHaveBeenCalled();
  });
});
