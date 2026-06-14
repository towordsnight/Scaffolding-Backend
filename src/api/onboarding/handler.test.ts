import { acceptConsent, declaration, getDiagnosticProblems, submitDiagnostic } from './handler';
import pool from '../../db/client';
import type { Response } from 'express';
import type { AuthRequest } from '../auth/middleware';

jest.mock('../../db/client', () => ({
  __esModule: true,
  default: { query: jest.fn(), connect: jest.fn() },
}));

const mockPool = pool as jest.Mocked<typeof pool>;

function makeRes(): jest.Mocked<Response> {
  const res = { status: jest.fn(), json: jest.fn() } as unknown as jest.Mocked<Response>;
  res.status.mockReturnValue(res);
  return res;
}

function makeReq(body: Record<string, unknown>): AuthRequest {
  return { body, studentId: 'stu-1' } as AuthRequest;
}

beforeEach(() => jest.clearAllMocks());

// ── declaration ────────────────────────────────────────────────────────────────

// All five scores below map to Medium level (2.76–3.50): Profile 3 or 4 depending on exact values.
// Using distinct values so the classifier always produces a deterministic result.
const baseDeclaration = {
  adhd_flag: false,
  course_level: 'intro',
  attention_score: 3.0,   // Medium → not High attention
  autonomy_score:  3.2,   // Medium
  competence_score: 3.2,  // Medium
  self_regulation_score: 3.2, // Medium
  self_efficacy_score:   3.2, // Medium
};

describe('POST /api/onboarding/declaration', () => {
  it('returns 400 when required fields are missing', async () => {
    const res = makeRes();
    await declaration(makeReq({}), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 for score below range', async () => {
    const res = makeRes();
    await declaration(makeReq({ ...baseDeclaration, attention_score: 0.5 }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 for score above range', async () => {
    const res = makeRes();
    await declaration(makeReq({ ...baseDeclaration, attention_score: 6 }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 403 when consent not given', async () => {
    (mockPool.query as jest.Mock).mockResolvedValue({ rows: [{ consent_given_at: null }] });
    const res = makeRes();
    await declaration(makeReq(baseDeclaration), res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('returns 200 and writes thresholds on happy path', async () => {
    const client = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    };
    (mockPool.query as jest.Mock).mockResolvedValue({ rows: [{ consent_given_at: new Date() }] });
    (mockPool.connect as jest.Mock).mockResolvedValue(client);

    const res = makeRes();
    await declaration(makeReq({ ...baseDeclaration, course_level: 'intermediate' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ declared: true });
  });

  it('sets idle_threshold_s=60 when self_regulation score is Low (< 2.76) without adhd_flag', async () => {
    const client = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    };
    (mockPool.query as jest.Mock).mockResolvedValue({ rows: [{ consent_given_at: new Date() }] });
    (mockPool.connect as jest.Mock).mockResolvedValue(client);

    const res = makeRes();
    // 2.0 is Low (< 2.76); attention is also Low so isHighNeed=false; selfRegIdle=60
    await declaration(makeReq({ ...baseDeclaration, adhd_flag: false, self_regulation_score: 2.0 }), res);
    expect(res.status).toHaveBeenCalledWith(200);

    const calls: string[][] = client.query.mock.calls.map((c: unknown[]) => c as string[]);
    const configCall = calls.find(([sql]) => typeof sql === 'string' && sql.includes('adaptive_config'));
    expect(configCall).toBeDefined();
    // idle_threshold_s is the first positional param ($1)
    expect(configCall![1][0]).toBe(60);
  });

  it('sets hint_depth_preference=concrete when self_efficacy score is Low (< 2.76)', async () => {
    const client = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    };
    (mockPool.query as jest.Mock).mockResolvedValue({ rows: [{ consent_given_at: new Date() }] });
    (mockPool.connect as jest.Mock).mockResolvedValue(client);

    const res = makeRes();
    // 1.5 is Low → hint_depth = 'concrete'
    await declaration(makeReq({ ...baseDeclaration, self_efficacy_score: 1.5 }), res);
    expect(res.status).toHaveBeenCalledWith(200);

    const calls: string[][] = client.query.mock.calls.map((c: unknown[]) => c as string[]);
    const skillCall = calls.find(([sql]) => typeof sql === 'string' && sql.includes('student_skills'));
    expect(skillCall).toBeDefined();
    expect(skillCall![1][0]).toBe('concrete');
  });

  it('writes the classifier-assigned learner_profile to students', async () => {
    const client = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    };
    (mockPool.query as jest.Mock).mockResolvedValue({ rows: [{ consent_given_at: new Date() }] });
    (mockPool.connect as jest.Mock).mockResolvedValue(client);

    const res = makeRes();
    // Profile 4 (independent): SE=High, SR=High, Attn=Low, Aut=High, Comp=High
    await declaration(makeReq({
      ...baseDeclaration,
      self_efficacy_score:   4.5, // High
      self_regulation_score: 4.5, // High
      attention_score:       1.5, // Low
      autonomy_score:        4.5, // High
      competence_score:      4.5, // High
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);

    const calls: string[][] = client.query.mock.calls.map((c: unknown[]) => c as string[]);
    const studentCall = calls.find(([sql]) => typeof sql === 'string' && sql.includes('UPDATE students'));
    expect(studentCall).toBeDefined();
    // learner_profile is $3 in the UPDATE students query
    expect(studentCall![1][2]).toBe('independent');
  });

  it('writes ambiguous flag when max profile match score is below 3', async () => {
    const client = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    };
    (mockPool.query as jest.Mock).mockResolvedValue({ rows: [{ consent_given_at: new Date() }] });
    (mockPool.connect as jest.Mock).mockResolvedValue(client);

    const res = makeRes();
    // Conflicting levels that no profile can score >= 3 on:
    // SE=High, SR=Low, Attn=Medium, Aut=Low, Comp=High
    // P1: SE✗ SR✓ Attn✗ Aut✓ Comp✗ = 2
    // P2: SE✗ SR✓ Attn✓ Aut✗ Comp✗ = 2
    // P3: SE✓ SR✗ Attn✗ Aut✗ Comp✗ = 1
    // P4: SE✓ SR✗ Attn✗ Aut✗ Comp✓ = 2
    await declaration(makeReq({
      ...baseDeclaration,
      self_efficacy_score:   4.5, // High
      self_regulation_score: 1.5, // Low
      attention_score:       3.2, // Medium
      autonomy_score:        1.5, // Low
      competence_score:      4.5, // High
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);

    const calls: string[][] = client.query.mock.calls.map((c: unknown[]) => c as string[]);
    const studentCall = calls.find(([sql]) => typeof sql === 'string' && sql.includes('UPDATE students'));
    expect(studentCall).toBeDefined();
    // classification_flag is $10 in the UPDATE students query
    expect(studentCall![1][9]).toBe('ambiguous');
  });
});

// ── getDiagnosticProblems ──────────────────────────────────────────────────────

describe('GET /api/onboarding/problems', () => {
  it('returns 403 when consent not given', async () => {
    (mockPool.query as jest.Mock).mockResolvedValue({
      rows: [{ course_level: 'intro', cold_start_done: false, consent_given_at: null }],
    });
    const res = makeRes();
    await getDiagnosticProblems({ studentId: 'stu-1', body: {} } as AuthRequest, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('returns 409 when onboarding already done', async () => {
    (mockPool.query as jest.Mock).mockResolvedValue({
      rows: [{ course_level: 'intro', cold_start_done: true, consent_given_at: new Date() }],
    });
    const res = makeRes();
    await getDiagnosticProblems({ studentId: 'stu-1', body: {} } as AuthRequest, res);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('returns 503 when problem bank is empty', async () => {
    (mockPool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ course_level: 'intro', cold_start_done: false, consent_given_at: new Date() }] })
      .mockResolvedValue({ rows: [] }); // problems empty

    const res = makeRes();
    await getDiagnosticProblems({ studentId: 'stu-1', body: {} } as AuthRequest, res);
    expect(res.status).toHaveBeenCalledWith(503);
  });

  it('returns 200 with 3 problems on happy path', async () => {
    const fakeProblem = { id: 'p1', topic: 'kvl', difficulty: 'easy', problem_text: 'q', error_taxonomy: [] };
    (mockPool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ course_level: 'intro', cold_start_done: false, consent_given_at: new Date() }] })
      .mockResolvedValue({ rows: [fakeProblem] });

    const res = makeRes();
    await getDiagnosticProblems({ studentId: 'stu-1', body: {} } as AuthRequest, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = (res.json as jest.Mock).mock.calls[0][0] as { problems: unknown[] };
    expect(body.problems).toHaveLength(3);
  });
});

// ── submitDiagnostic ───────────────────────────────────────────────────────────

describe('POST /api/onboarding/diagnostic', () => {
  it('returns 400 when answers array is wrong length', async () => {
    const res = makeRes();
    await submitDiagnostic(makeReq({ answers: [{ problem_id: 'p1', submitted_answer: 9, time_spent_s: 30 }] }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 403 when consent not given', async () => {
    (mockPool.query as jest.Mock).mockResolvedValue({ rows: [{ consent_given_at: null, cold_start_done: false }] });
    const answers = [
      { problem_id: 'p1', submitted_answer: 9, time_spent_s: 30 },
      { problem_id: 'p2', submitted_answer: 3, time_spent_s: 20 },
      { problem_id: 'p3', submitted_answer: 10, time_spent_s: 25 },
    ];
    const res = makeRes();
    await submitDiagnostic(makeReq({ answers }), res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('completes onboarding and returns 200 with results', async () => {
    const answers = [
      { problem_id: 'p1', submitted_answer: 9, time_spent_s: 30 },
      { problem_id: 'p2', submitted_answer: 3, time_spent_s: 20 },
      { problem_id: 'p3', submitted_answer: 10, time_spent_s: 25 },
    ];

    const problems = [
      { id: 'p1', topic: 'kvl',     ground_truth_answer: 9,  tolerance: 0.01 },
      { id: 'p2', topic: 'kcl',     ground_truth_answer: 3,  tolerance: 0.01 },
      { id: 'p3', topic: 'phasors', ground_truth_answer: 10, tolerance: 0.01 },
    ];

    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [] })              // BEGIN
        .mockResolvedValueOnce({ rows: [{ tier: 1 }] })  // SELECT tier p1
        .mockResolvedValueOnce({ rows: [] })              // INSERT attempt p1
        .mockResolvedValueOnce({ rows: [] })              // UPDATE skill p1
        .mockResolvedValueOnce({ rows: [{ tier: 1 }] })  // SELECT tier p2
        .mockResolvedValueOnce({ rows: [] })              // INSERT attempt p2
        .mockResolvedValueOnce({ rows: [] })              // UPDATE skill p2
        .mockResolvedValueOnce({ rows: [{ tier: 1 }] })  // SELECT tier p3
        .mockResolvedValueOnce({ rows: [] })              // INSERT attempt p3
        .mockResolvedValueOnce({ rows: [] })              // UPDATE skill p3
        .mockResolvedValueOnce({ rows: [] })              // UPDATE cold_start_done
        .mockResolvedValue({ rows: [] }),                 // COMMIT
      release: jest.fn(),
    };

    (mockPool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ consent_given_at: new Date(), cold_start_done: false }] })
      .mockResolvedValueOnce({ rows: problems })           // SELECT problems
      .mockResolvedValueOnce({ rows: [{ id: 'sess-1' }] }); // INSERT session

    (mockPool.connect as jest.Mock).mockResolvedValue(client);

    const res = makeRes();
    await submitDiagnostic(makeReq({ answers }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = (res.json as jest.Mock).mock.calls[0][0] as { completed: boolean; results: unknown[] };
    expect(body.completed).toBe(true);
    expect(body.results).toHaveLength(3);
  });
});

// ── acceptConsent ──────────────────────────────────────────────────────────────

describe('POST /api/onboarding/consent', () => {
  it('returns 400 when consent field is missing', async () => {
    const res = makeRes();
    await acceptConsent(makeReq({}), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when consent is not a boolean', async () => {
    const res = makeRes();
    await acceptConsent(makeReq({ consent: 'yes' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 200 with consented=false and logs but does not set consent_given_at', async () => {
    const client = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    };
    (mockPool.connect as jest.Mock).mockResolvedValue(client);

    const res = makeRes();
    await acceptConsent({ ...makeReq({ consent: false }), ip: '127.0.0.1' } as AuthRequest, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ consented: false });

    const calls = client.query.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(calls.some((q: string) => q.includes('consent_log'))).toBe(true);
    expect(calls.some((q: string) => q.includes('consent_given_at'))).toBe(false);
  });

  it('returns 200 with consented=true and sets consent_given_at', async () => {
    const client = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    };
    (mockPool.connect as jest.Mock).mockResolvedValue(client);

    const res = makeRes();
    await acceptConsent({ ...makeReq({ consent: true }), ip: '127.0.0.1' } as AuthRequest, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ consented: true });

    const calls = client.query.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(calls.some((q: string) => q.includes('consent_log'))).toBe(true);
    expect(calls.some((q: string) => q.includes('consent_given_at'))).toBe(true);
  });
});
