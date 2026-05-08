import { Request, Response } from 'express';
import pool from '../../db/client';
import { getSession, setSession, extendTTL, deleteSession } from '../../redis/session-store';
import { AuthRequest } from '../auth/middleware';
import type { RedisSession } from '../../types/schema';
import { checkIdleThreshold } from '../../services/adaptive-engine';
import { updateIdleStreak } from '../../services/cognitive-state';

// POST /api/sessions
// Body: { problem_id? }
// Creates a new session row in Postgres and seeds the Redis cache.
export async function createSession(req: Request, res: Response): Promise<void> {
  const studentId = (req as AuthRequest).studentId;
  const { problem_id } = req.body as { problem_id?: string };

  const result = await pool.query<{ id: string }>(
    'INSERT INTO sessions (student_id, current_problem_id) VALUES ($1, $2) RETURNING id',
    [studentId, problem_id ?? null],
  );
  const sessionId = result.rows[0].id;

  const now = new Date().toISOString();
  const redisSession: RedisSession = {
    current_problem_id:    problem_id ?? null,
    current_problem_state: { answer_draft: null, steps: [], last_modified: now },
    hint_history:          [],
    last_input_at:         now,
    last_seen_at:          now,
    idle_streak_seconds:   0,
    consecutive_errors:    0,
    hints_used_this_problem: 0,
  };

  await setSession(sessionId, redisSession);
  res.status(201).json({ session_id: sessionId });
}

// POST /api/sessions/:id/heartbeat
// Extends Redis TTL and updates last_seen_at in Postgres every 30 s.
export async function heartbeat(req: Request, res: Response): Promise<void> {
  const studentId = (req as AuthRequest).studentId;
  const { id: sessionId } = req.params;

  const check = await pool.query(
    'SELECT id FROM sessions WHERE id=$1 AND student_id=$2 AND ended_at IS NULL',
    [sessionId, studentId],
  );
  if (check.rows.length === 0) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  await pool.query('UPDATE sessions SET last_seen_at=now() WHERE id=$1', [sessionId]);
  await extendTTL(sessionId);

  // Compute idle streak and check threshold
  const redisSession = await getSession(sessionId);
  let intervention = null;
  if (redisSession?.last_input_at) {
    const idleStreakS = Math.floor((Date.now() - new Date(redisSession.last_input_at).getTime()) / 1000);
    const updated = { ...redisSession, idle_streak_seconds: idleStreakS };
    await setSession(sessionId, updated);
    intervention = await checkIdleThreshold(sessionId, studentId, idleStreakS);
    if (intervention) {
      await updateIdleStreak(studentId, idleStreakS);
    }
  }

  res.status(200).json({ intervention: intervention ?? null });
}

// POST /api/sessions/:id/end
// Marks the session finished and increments sessions_completed on the student.
// Uses RETURNING on the sessions UPDATE so the increment only fires if the session
// existed, belonged to this student, and was not already ended — race-safe.
export async function endSession(req: Request, res: Response): Promise<void> {
  const studentId = (req as AuthRequest).studentId;
  const { id: sessionId } = req.params;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const update = await client.query<{ id: string }>(
      `UPDATE sessions SET ended_at = now()
        WHERE id = $1 AND student_id = $2 AND ended_at IS NULL
        RETURNING id`,
      [sessionId, studentId],
    );

    if (update.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    await client.query(
      `UPDATE students SET sessions_completed = sessions_completed + 1, updated_at = now()
        WHERE id = $1`,
      [studentId],
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  await deleteSession(sessionId);
  res.status(200).json({ ended: true });
}

// GET /api/sessions/:id
// Returns the session row and Redis state (re-hydrates from Postgres on cache miss).
export async function getSessionState(req: Request, res: Response): Promise<void> {
  const studentId = (req as AuthRequest).studentId;
  const { id: sessionId } = req.params;

  const sessionRow = await pool.query<{
    id: string;
    current_problem_id: string | null;
    started_at: Date;
    last_seen_at: Date;
  }>(
    `SELECT id, current_problem_id, started_at, last_seen_at
     FROM sessions WHERE id=$1 AND student_id=$2 AND ended_at IS NULL`,
    [sessionId, studentId],
  );

  if (sessionRow.rows.length === 0) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  const state = await getSession(sessionId);
  res.status(200).json({ session: sessionRow.rows[0], state });
}
