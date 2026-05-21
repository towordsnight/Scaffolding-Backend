import { getSession, setSession, extendTTL, deleteSession } from './session-store';

jest.mock('./client', () => ({
  __esModule: true,
  default: {
    get:    jest.fn(),
    set:    jest.fn().mockResolvedValue('OK'),
    expire: jest.fn().mockResolvedValue(1),
    del:    jest.fn().mockResolvedValue(1),
  },
}));

jest.mock('../db/client', () => ({
  __esModule: true,
  default: { query: jest.fn() },
}));

import redis from './client';
import pool from '../db/client';

const mockRedis = redis as jest.Mocked<typeof redis>;
const mockPool  = pool  as jest.Mocked<typeof pool>;

beforeEach(() => jest.clearAllMocks());

describe('getSession', () => {
  it('returns parsed session from Redis cache hit', async () => {
    const cached = {
      current_problem_id: 'p1',
      current_problem_state: { answer_draft: null, steps: [], last_modified: '2026-01-01T00:00:00.000Z' },
      hint_history: [],
      last_input_at: '2026-01-01T00:00:00.000Z',
      last_seen_at:  '2026-01-01T00:00:00.000Z',
      idle_streak_seconds: 0,
      consecutive_errors: 0,
      hints_used_this_problem: 0,
    };
    (mockRedis.get as jest.Mock).mockResolvedValue(JSON.stringify(cached));

    const result = await getSession('sess-1');
    expect(result).toEqual(cached);
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  it('reloads from Postgres on cache miss and writes back to Redis', async () => {
    (mockRedis.get as jest.Mock).mockResolvedValue(null);

    const pgRow = {
      current_problem_id:    'p2',
      current_problem_state: { answer_draft: null, steps: [], last_modified: '2026-01-01T00:00:00.000Z' },
      hint_history:          [],
      last_seen_at:          new Date('2026-01-01T00:00:00.000Z'),
    };
    (mockPool.query as jest.Mock).mockResolvedValue({ rows: [pgRow] });

    const result = await getSession('sess-2');

    expect(result).not.toBeNull();
    expect(result!.current_problem_id).toBe('p2');
    expect(result!.idle_streak_seconds).toBe(0);
    expect(mockRedis.set).toHaveBeenCalled();
  });

  it('returns null when session not found in Redis or Postgres', async () => {
    (mockRedis.get as jest.Mock).mockResolvedValue(null);
    (mockPool.query as jest.Mock).mockResolvedValue({ rows: [] });

    const result = await getSession('sess-missing');
    expect(result).toBeNull();
  });
});

describe('setSession', () => {
  it('serializes and stores session with TTL', async () => {
    const session = {
      current_problem_id: null,
      current_step_id: null,
      current_problem_state: { answer_draft: null, steps: [], last_modified: '' },
      hint_history: [],
      last_input_at: '',
      last_seen_at: '',
      idle_streak_seconds: 0,
      consecutive_errors: 0,
      hints_used_this_problem: 0,
    };
    await setSession('sess-3', session);
    expect(mockRedis.set).toHaveBeenCalledWith(
      'session:sess-3',
      JSON.stringify(session),
      'EX',
      expect.any(Number),
    );
  });
});

describe('extendTTL', () => {
  it('calls expire on the session key', async () => {
    await extendTTL('sess-4');
    expect(mockRedis.expire).toHaveBeenCalledWith('session:sess-4', expect.any(Number));
  });
});

describe('deleteSession', () => {
  it('deletes the session key', async () => {
    await deleteSession('sess-5');
    expect(mockRedis.del).toHaveBeenCalledWith('session:sess-5');
  });
});
