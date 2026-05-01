import { updateSkillTier } from './skill-updater';
import pool from '../db/client';

jest.mock('../db/client', () => ({
  __esModule: true,
  default: { query: jest.fn() },
}));

const mockPool = pool as jest.Mocked<typeof pool>;

function mockSkillRow(tier: number, up: number, down: number) {
  (mockPool.query as jest.Mock).mockResolvedValueOnce({
    rows: [{ tier, consecutive_up: up, consecutive_down: down }],
  });
  (mockPool.query as jest.Mock).mockResolvedValueOnce({ rows: [] }); // UPDATE
}

beforeEach(() => jest.clearAllMocks());

describe('updateSkillTier', () => {
  it('does nothing when skill row is missing', async () => {
    (mockPool.query as jest.Mock).mockResolvedValue({ rows: [] });
    await updateSkillTier('stu-1', 'kvl', { correct: true, hintsUsed: 0, hintBudgetExhausted: false });
    expect(mockPool.query).toHaveBeenCalledTimes(1);
  });

  it('increments consecutive_up on correct with 0 hints, no tier change before 2', async () => {
    mockSkillRow(1, 0, 0);
    await updateSkillTier('stu-1', 'kvl', { correct: true, hintsUsed: 0, hintBudgetExhausted: false });
    const updateCall = (mockPool.query as jest.Mock).mock.calls[1];
    expect(updateCall[1]).toEqual([1, 1, 0, 'stu-1', 'kvl']); // tier stays 1, up becomes 1
  });

  it('advances tier after 2 consecutive correct with 0 hints', async () => {
    mockSkillRow(1, 1, 0); // already at consecutive_up=1
    await updateSkillTier('stu-1', 'kvl', { correct: true, hintsUsed: 0, hintBudgetExhausted: false });
    const updateCall = (mockPool.query as jest.Mock).mock.calls[1];
    expect(updateCall[1][0]).toBe(2); // tier advances to 2
    expect(updateCall[1][1]).toBe(0); // consecutive_up resets
  });

  it('caps tier at 3', async () => {
    mockSkillRow(3, 1, 0);
    await updateSkillTier('stu-1', 'kvl', { correct: true, hintsUsed: 0, hintBudgetExhausted: false });
    const updateCall = (mockPool.query as jest.Mock).mock.calls[1];
    expect(updateCall[1][0]).toBe(3);
  });

  it('increments consecutive_down when hint budget exhausted', async () => {
    mockSkillRow(2, 0, 0);
    await updateSkillTier('stu-1', 'kvl', { correct: false, hintsUsed: 3, hintBudgetExhausted: true });
    const updateCall = (mockPool.query as jest.Mock).mock.calls[1];
    expect(updateCall[1]).toEqual([2, 0, 1, 'stu-1', 'kvl']);
  });

  it('drops tier after 2 consecutive hint-budget-exhausted', async () => {
    mockSkillRow(2, 0, 1);
    await updateSkillTier('stu-1', 'kvl', { correct: false, hintsUsed: 3, hintBudgetExhausted: true });
    const updateCall = (mockPool.query as jest.Mock).mock.calls[1];
    expect(updateCall[1][0]).toBe(1); // tier drops to 1
    expect(updateCall[1][2]).toBe(0); // consecutive_down resets
  });

  it('floors tier at 0', async () => {
    mockSkillRow(0, 0, 1);
    await updateSkillTier('stu-1', 'kvl', { correct: false, hintsUsed: 3, hintBudgetExhausted: true });
    const updateCall = (mockPool.query as jest.Mock).mock.calls[1];
    expect(updateCall[1][0]).toBe(0);
  });

  it('resets both counters when solved with hints used (not exhausted)', async () => {
    mockSkillRow(1, 0, 1);
    await updateSkillTier('stu-1', 'kvl', { correct: true, hintsUsed: 2, hintBudgetExhausted: false });
    const updateCall = (mockPool.query as jest.Mock).mock.calls[1];
    expect(updateCall[1]).toEqual([1, 0, 0, 'stu-1', 'kvl']); // tier unchanged, counters reset
  });

  it('does not change counters on incorrect without budget exhaustion', async () => {
    mockSkillRow(1, 1, 0);
    await updateSkillTier('stu-1', 'kvl', { correct: false, hintsUsed: 1, hintBudgetExhausted: false });
    const updateCall = (mockPool.query as jest.Mock).mock.calls[1];
    expect(updateCall[1]).toEqual([1, 1, 0, 'stu-1', 'kvl']); // unchanged
  });
});
