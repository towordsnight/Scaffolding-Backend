import pool from '../db/client';

// Self-report weight decays with experience: max(0.2, 0.8 - 0.1 × sessions_completed)
export function decayWeight(sessionsCompleted: number): number {
  return Math.max(0.2, 0.8 - 0.1 * sessionsCompleted);
}

// Behavioral stress proxy: consecutive errors scaled to [0,2] against the error threshold.
export function behavioralStressScore(consecutiveErrors: number, errorThreshold: number): number {
  return Math.min(2, Math.round((consecutiveErrors / errorThreshold) * 2));
}

// Recalculates and writes stress_level using the blend formula, then rewrites adaptive_config
// thresholds based on the new stress + adhd_flag.
export async function recalcStressAndThresholds(studentId: string): Promise<void> {
  const result = await pool.query<{
    stress_level: number;
    consecutive_errors: number;
    idle_streak_s: number;
    self_report_weight: number;
    adhd_flag: boolean;
    course_level: string;
    sessions_completed: number;
    error_threshold: number;
    idle_threshold_s: number;
  }>(
    `SELECT cs.stress_level, cs.consecutive_errors, cs.idle_streak_s, cs.self_report_weight,
            s.adhd_flag, s.course_level, s.sessions_completed,
            ac.error_threshold, ac.idle_threshold_s
       FROM cognitive_state cs
       JOIN students s ON s.id = cs.student_id
       JOIN adaptive_config ac ON ac.student_id = cs.student_id
      WHERE cs.student_id = $1`,
    [studentId],
  );

  if (result.rows.length === 0) return;
  const r = result.rows[0];

  const weight         = decayWeight(r.sessions_completed);
  const errorBehavioral = behavioralStressScore(r.consecutive_errors, r.error_threshold);
  const idlePressure    = r.idle_streak_s >= r.idle_threshold_s ? 1 : 0;
  const behavioral      = Math.min(2, errorBehavioral + idlePressure) as 0 | 1 | 2;
  const newStress       = Math.round(weight * r.stress_level + (1 - weight) * behavioral) as 0 | 1 | 2;
  const clampedStress = Math.max(0, Math.min(2, newStress)) as 0 | 1 | 2;

  const isHighNeed = r.adhd_flag || clampedStress === 2;
  const isAdvanced = r.course_level === 'advanced';
  const idleThreshold  = isHighNeed ? 60  : isAdvanced ? 180 : 90;
  const errorThreshold = isHighNeed ? 2   : isAdvanced ? 4   : 3;
  const hintBudget     = isHighNeed ? 4   : isAdvanced ? 2   : 3;
  const responseLength = isHighNeed ? 'brief' : isAdvanced ? 'short' : 'medium';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE cognitive_state SET stress_level=$1, self_report_weight=$2, updated_at=now()
        WHERE student_id=$3`,
      [clampedStress, weight, studentId],
    );
    await client.query(
      `UPDATE adaptive_config
          SET idle_threshold_s=$1, error_threshold=$2, hint_budget=$3,
              response_length_budget=$4, updated_at=now()
        WHERE student_id=$5`,
      [idleThreshold, errorThreshold, hintBudget, responseLength, studentId],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Updates consecutive_errors after an attempt: increments on wrong, resets on correct.
// Then triggers a stress/threshold recalculation.
export async function updateConsecutiveErrors(studentId: string, correct: boolean): Promise<void> {
  if (correct) {
    await pool.query(
      `UPDATE cognitive_state SET consecutive_errors=0, idle_streak_s=0, updated_at=now()
        WHERE student_id=$1`,
      [studentId],
    );
  } else {
    await pool.query(
      `UPDATE cognitive_state SET consecutive_errors=consecutive_errors+1, idle_streak_s=0, updated_at=now()
        WHERE student_id=$1`,
      [studentId],
    );
  }
  await recalcStressAndThresholds(studentId);
}

// Persists the current idle streak when the heartbeat detects a threshold breach,
// then recalculates stress so adaptive_config reflects the student's disengagement.
export async function updateIdleStreak(studentId: string, idleStreakS: number): Promise<void> {
  await pool.query(
    `UPDATE cognitive_state SET idle_streak_s=$1, updated_at=now() WHERE student_id=$2`,
    [idleStreakS, studentId],
  );
  await recalcStressAndThresholds(studentId);
}

// Updates cognitive state from a checkin value and recalculates thresholds.
// The audit INSERT into checkin_responses is the caller's responsibility (events handler).
export async function updateFromCheckin(
  studentId: string,
  _sessionId: string,
  _questionKey: string,
  numericValue: number,
): Promise<void> {
  const clamped = Math.max(0, Math.min(2, numericValue)) as 0 | 1 | 2;
  await pool.query(
    `UPDATE cognitive_state SET stress_level=$1, updated_at=now() WHERE student_id=$2`,
    [clamped, studentId],
  );

  await recalcStressAndThresholds(studentId);
}
