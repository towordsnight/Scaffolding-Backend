import pool from '../db/client';

export type InterventionTrigger =
  | { type: 'idle';         idleStreakS: number }
  | { type: 'error_streak'; consecutiveErrors: number }
  | { type: 'hint_budget_exhausted'; hintsUsed: number };

// Logs an intervention event (append-only) and returns the trigger for the caller to relay to client.
async function logIntervention(
  sessionId: string,
  studentId: string,
  trigger: InterventionTrigger,
): Promise<void> {
  await pool.query(
    `INSERT INTO intervention_events (session_id, student_id, trigger_type, trigger_value, response_type)
     VALUES ($1, $2, $3, $4, $5)`,
    [sessionId, studentId, trigger.type, trigger, 'hint'],
  );
}

// Called from heartbeat. Returns the trigger if idle threshold is breached, null otherwise.
export async function checkIdleThreshold(
  sessionId: string,
  studentId: string,
  idleStreakS: number,
): Promise<InterventionTrigger | null> {
  const result = await pool.query<{ idle_threshold_s: number }>(
    'SELECT idle_threshold_s FROM adaptive_config WHERE student_id=$1',
    [studentId],
  );
  if (result.rows.length === 0) return null;

  const { idle_threshold_s } = result.rows[0];
  if (idleStreakS < idle_threshold_s) return null;

  const trigger: InterventionTrigger = { type: 'idle', idleStreakS };
  await logIntervention(sessionId, studentId, trigger);
  return trigger;
}

// Called from submitAnswer. Returns the first threshold breached, or null.
export async function checkAfterSubmit(
  sessionId: string,
  studentId: string,
  consecutiveErrors: number,
  hintsUsed: number,
): Promise<InterventionTrigger | null> {
  const result = await pool.query<{ error_threshold: number; hint_budget: number }>(
    'SELECT error_threshold, hint_budget FROM adaptive_config WHERE student_id=$1',
    [studentId],
  );
  if (result.rows.length === 0) return null;

  const { error_threshold, hint_budget } = result.rows[0];

  if (consecutiveErrors >= error_threshold) {
    const trigger: InterventionTrigger = { type: 'error_streak', consecutiveErrors };
    await logIntervention(sessionId, studentId, trigger);
    return trigger;
  }

  if (hintsUsed >= hint_budget) {
    const trigger: InterventionTrigger = { type: 'hint_budget_exhausted', hintsUsed };
    await logIntervention(sessionId, studentId, trigger);
    return trigger;
  }

  return null;
}
