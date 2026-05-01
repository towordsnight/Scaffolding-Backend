import { decayWeight, behavioralStressScore, updateConsecutiveErrors, updateFromCheckin, recalcStressAndThresholds } from './cognitive-state';
import pool from '../db/client';

jest.mock('../db/client', () => ({
  __esModule: true,
  default: { query: jest.fn(), connect: jest.fn() },
}));

const mockPool = pool as jest.Mocked<typeof pool>;

beforeEach(() => jest.clearAllMocks());

// ── pure helpers ───────────────────────────────────────────────────────────────

describe('decayWeight', () => {
  it('starts at 0.8 for 0 sessions', () => expect(decayWeight(0)).toBeCloseTo(0.8));
  it('decays by 0.1 per session', () => expect(decayWeight(3)).toBeCloseTo(0.5));
  it('floors at 0.2', () => expect(decayWeight(10)).toBeCloseTo(0.2));
  it('does not go below 0.2', () => expect(decayWeight(100)).toBeCloseTo(0.2));
});

describe('behavioralStressScore', () => {
  it('returns 0 when no errors', () => expect(behavioralStressScore(0, 3)).toBe(0));
  it('scales proportionally and rounds', () => expect(behavioralStressScore(3, 3)).toBe(2));
  it('caps at 2', () => expect(behavioralStressScore(10, 3)).toBe(2));
});

// ── recalcStressAndThresholds ──────────────────────────────────────────────────

describe('recalcStressAndThresholds', () => {
  it('does nothing when student not found', async () => {
    (mockPool.query as jest.Mock).mockResolvedValue({ rows: [] });
    await recalcStressAndThresholds('stu-missing');
    expect(mockPool.connect).not.toHaveBeenCalled();
  });

  it('writes blended stress and recalculated thresholds for normal student', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() };
    (mockPool.query as jest.Mock).mockResolvedValue({
      rows: [{
        stress_level: 1, consecutive_errors: 0, self_report_weight: 0.8,
        adhd_flag: false, course_level: 'intro', sessions_completed: 0, error_threshold: 3,
      }],
    });
    (mockPool.connect as jest.Mock).mockResolvedValue(client);

    await recalcStressAndThresholds('stu-1');

    const calls = client.query.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(calls.some((q: string) => q.includes('cognitive_state'))).toBe(true);
    expect(calls.some((q: string) => q.includes('adaptive_config'))).toBe(true);
  });

  it('sets high-need thresholds when adhd_flag=true', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() };
    (mockPool.query as jest.Mock).mockResolvedValue({
      rows: [{
        stress_level: 0, consecutive_errors: 0, self_report_weight: 0.8,
        adhd_flag: true, course_level: 'intro', sessions_completed: 0, error_threshold: 3,
      }],
    });
    (mockPool.connect as jest.Mock).mockResolvedValue(client);

    await recalcStressAndThresholds('stu-adhd');

    const adaptiveUpdate = client.query.mock.calls.find(
      (c: unknown[]) => (c[0] as string).includes('adaptive_config'),
    ) as unknown[];
    // idle=60, error=2, hints=4 for high-need
    expect(adaptiveUpdate[1]).toEqual([60, 2, 4, 'brief', 'stu-adhd']);
  });
});

// ── updateConsecutiveErrors ───────────────────────────────────────────────────

describe('updateConsecutiveErrors', () => {
  it('resets consecutive_errors to 0 on correct answer', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() };
    (mockPool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [] }) // UPDATE reset
      .mockResolvedValueOnce({ rows: [] }); // recalc SELECT (no rows → early return)
    (mockPool.connect as jest.Mock).mockResolvedValue(client);

    await updateConsecutiveErrors('stu-1', true);

    const resetCall = (mockPool.query as jest.Mock).mock.calls[0];
    expect((resetCall[0] as string)).toContain('consecutive_errors=0');
  });

  it('increments consecutive_errors on incorrect answer', async () => {
    (mockPool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [] }) // UPDATE increment
      .mockResolvedValueOnce({ rows: [] }); // recalc SELECT (no rows)

    await updateConsecutiveErrors('stu-1', false);

    const incrCall = (mockPool.query as jest.Mock).mock.calls[0];
    expect((incrCall[0] as string)).toContain('consecutive_errors+1');
  });
});

// ── updateFromCheckin ─────────────────────────────────────────────────────────

describe('updateFromCheckin', () => {
  it('updates stress_level and triggers recalc (no checkin_responses insert)', async () => {
    (mockPool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [] }) // UPDATE stress_level
      .mockResolvedValueOnce({ rows: [] }); // recalc SELECT (no rows)

    await updateFromCheckin('stu-1', 'sess-1', 'stress', 2);

    const firstCall = (mockPool.query as jest.Mock).mock.calls[0];
    expect((firstCall[0] as string)).toContain('cognitive_state');
    expect((firstCall[0] as string)).not.toContain('checkin_responses');
  });

  it('clamps numeric_value to [0, 2]', async () => {
    (mockPool.query as jest.Mock).mockResolvedValue({ rows: [] });

    await updateFromCheckin('stu-1', 'sess-1', 'stress', 5);

    const updateCall = (mockPool.query as jest.Mock).mock.calls[0];
    expect(updateCall[1][0]).toBe(2); // clamped to 2
  });
});
