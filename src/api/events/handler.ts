// POST /api/events
// Ingests client-side events and writes to the appropriate append-only audit table.
// Constraint #1: these tables have SQL rules blocking UPDATE/DELETE — inserts only.

import { Request, Response } from 'express';
import pool from '../../db/client';
import { AuthRequest } from '../auth/middleware';
import { sessionBelongsToStudent } from '../../db/queries/sessions';
import { updateFromCheckin } from '../../services/cognitive-state';

type EventType =
  | 'problem_attempt'
  | 'hint_event'
  | 'intervention_event'
  | 'state_snapshot'
  | 'checkin_response';

export async function logEvent(req: Request, res: Response): Promise<void> {
  const studentId = (req as AuthRequest).studentId;
  const { event_type, payload } = req.body as {
    event_type?: EventType;
    payload?: Record<string, unknown>;
  };

  if (!event_type || !payload) {
    res.status(400).json({ error: 'event_type and payload are required' });
    return;
  }

  // A client-supplied session_id must belong to this student — these are
  // append-only audit tables, so a cross-student row could never be removed.
  // (Some tables allow a null session_id; absence is left to DB constraints.)
  if (payload.session_id !== undefined && payload.session_id !== null) {
    const owned =
      typeof payload.session_id === 'string' &&
      (await sessionBelongsToStudent(payload.session_id, studentId));
    if (!owned) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
  }

  switch (event_type) {
    case 'problem_attempt':
      await insertProblemAttempt(studentId, payload);
      break;
    case 'hint_event':
      await insertHintEvent(studentId, payload);
      break;
    case 'intervention_event':
      await insertInterventionEvent(studentId, payload);
      break;
    case 'state_snapshot':
      await insertStateSnapshot(studentId, payload);
      break;
    case 'checkin_response':
      await insertCheckinResponse(studentId, payload);
      await updateFromCheckin(
        studentId,
        String(payload.session_id ?? ''),
        String(payload.question_key ?? ''),
        Number(payload.numeric_value ?? 0),
      );
      break;
    default:
      res.status(400).json({ error: `Unknown event_type: ${event_type as string}` });
      return;
  }

  res.status(204).end();
}

async function insertProblemAttempt(studentId: string, p: Record<string, unknown>): Promise<void> {
  await pool.query(
    `INSERT INTO problem_attempts
       (session_id, problem_id, student_id, submitted_answer, outcome, error_types, time_spent_s, skill_tier_at_attempt)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      p.session_id,
      p.problem_id,
      studentId,
      String(p.submitted_answer ?? ''),
      Boolean(p.outcome),
      Array.isArray(p.error_types) ? p.error_types : [],
      Number(p.time_spent_s ?? 0),
      Number(p.skill_tier_at_attempt ?? 1),
    ],
  );
}

async function insertHintEvent(studentId: string, p: Record<string, unknown>): Promise<void> {
  await pool.query(
    `INSERT INTO hint_events
       (session_id, problem_id, student_id, hint_level, hint_depth, absorbed, time_to_next_attempt_s, absorption_window_s)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      p.session_id,
      p.problem_id,
      studentId,
      Number(p.hint_level ?? 1),
      p.hint_depth ?? 'socratic',
      Boolean(p.absorbed),
      p.time_to_next_attempt_s != null ? Number(p.time_to_next_attempt_s) : null,
      p.absorption_window_s != null ? Number(p.absorption_window_s) : null,
    ],
  );
}

async function insertInterventionEvent(studentId: string, p: Record<string, unknown>): Promise<void> {
  await pool.query(
    `INSERT INTO intervention_events
       (session_id, student_id, trigger_type, trigger_value, response_type)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      p.session_id,
      studentId,
      String(p.trigger_type ?? ''),
      p.trigger_value ?? {},
      String(p.response_type ?? ''),
    ],
  );
}

async function insertStateSnapshot(studentId: string, p: Record<string, unknown>): Promise<void> {
  await pool.query(
    `INSERT INTO state_snapshots
       (student_id, session_id, stress_level, focus_quality, trigger)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      studentId,
      p.session_id,
      Number(p.stress_level ?? 0),
      Number(p.focus_quality ?? 0.5),
      String(p.trigger ?? ''),
    ],
  );
}

async function insertCheckinResponse(studentId: string, p: Record<string, unknown>): Promise<void> {
  await pool.query(
    `INSERT INTO checkin_responses
       (student_id, session_id, question_key, numeric_value)
     VALUES ($1, $2, $3, $4)`,
    [
      studentId,
      p.session_id,
      String(p.question_key ?? ''),
      Number(p.numeric_value ?? 0),
    ],
  );
}
