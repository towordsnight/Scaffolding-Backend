// Redis session helpers.
// On cache miss: reload from Postgres sessions table. Never fail silently.

import redis from './client';
import { sessionKey, SESSION_TTL_S } from './keys';
import type { RedisSession } from '../types/schema';
import pool from '../db/client';

export async function getSession(sessionId: string): Promise<RedisSession | null> {
  const key = sessionKey(sessionId);
  const raw = await redis.get(key);

  if (raw !== null) {
    return JSON.parse(raw) as RedisSession;
  }

  // Cache miss — reload from Postgres
  const result = await pool.query(
    `SELECT current_problem_id, current_step_id, current_problem_state, hint_history, last_seen_at
     FROM sessions WHERE id = $1`,
    [sessionId],
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  const now = new Date().toISOString();

  const session: RedisSession = {
    current_problem_id: row.current_problem_id ?? null,
    current_step_id: row.current_step_id ?? null,
    current_problem_state: row.current_problem_state ?? { answer_draft: null, steps: [], last_modified: now },
    hint_history: row.hint_history ?? [],
    last_input_at: now,
    last_seen_at: row.last_seen_at ? new Date(row.last_seen_at).toISOString() : now,
    idle_streak_seconds: 0,
    consecutive_errors: 0,
    hints_used_this_problem: 0,
  };

  await setSession(sessionId, session);
  return session;
}

export async function setSession(sessionId: string, session: RedisSession): Promise<void> {
  const key = sessionKey(sessionId);
  await redis.set(key, JSON.stringify(session), 'EX', SESSION_TTL_S);
}

export async function extendTTL(sessionId: string): Promise<void> {
  await redis.expire(sessionKey(sessionId), SESSION_TTL_S);
}

export async function deleteSession(sessionId: string): Promise<void> {
  await redis.del(sessionKey(sessionId));
}
