// Multi-step scaffolded-problem endpoints.
//   GET  /api/problems/:id/scaffold                  → ordered steps for the
//                                                       student's learner_profile
//   POST /api/problems/:id/steps/:stepId/submit      → grade one step,
//                                                       append to problem_step_attempts

import { Request, Response } from 'express';
import pool from '../../db/client';
import { AuthRequest } from '../auth/middleware';
import { getSession, setSession } from '../../redis/session-store';
import type { LearnerProfile, McqOption, StepType } from '../../types/schema';

const STEP_ATTEMPT_BUDGET = 5;

// Public step shape — never expose ground_truth_answer or option.is_correct.
interface PublicStep {
  id: string;
  step_order: number;
  step_type: StepType;
  prompt_text: string;
  options: Array<{ key: string; text: string }> | null;
}

// GET /api/problems/:id/scaffold
export async function getScaffold(req: Request, res: Response): Promise<void> {
  const studentId = (req as AuthRequest).studentId;
  const { id: problemId } = req.params;

  const studentRow = await pool.query<{ learner_profile: LearnerProfile | null }>(
    'SELECT learner_profile FROM students WHERE id=$1',
    [studentId],
  );
  // Default to 'starter' when onboarding declaration has not been completed yet.
  const profile: LearnerProfile = studentRow.rows[0]?.learner_profile ?? 'starter';

  // Try the student's own profile first; fall back to 'starter' so problems are
  // always accessible before a full variant library is seeded.
  let variantRow = await pool.query<{ id: string }>(
    'SELECT id FROM problem_variants WHERE problem_id=$1 AND learner_profile=$2',
    [problemId, profile],
  );
  if (variantRow.rows.length === 0 && profile !== 'starter') {
    variantRow = await pool.query<{ id: string }>(
      'SELECT id FROM problem_variants WHERE problem_id=$1 AND learner_profile=$2',
      [problemId, 'starter'],
    );
  }
  // No variant of any kind — return empty steps so the frontend degrades gracefully.
  if (variantRow.rows.length === 0) {
    const { session_id } = req.query as { session_id?: string };
    let currentStepId: string | null = null;
    if (session_id) {
      const redisSession = await getSession(session_id);
      currentStepId = redisSession?.current_step_id ?? null;
    }
    res.status(200).json({
      problem_id: problemId,
      variant_id: null,
      learner_profile: profile,
      total_steps: 0,
      current_step_id: currentStepId,
      steps: [],
    });
    return;
  }
  const variantId = variantRow.rows[0].id;

  const stepsResult = await pool.query<{
    id: string;
    step_order: number;
    step_type: StepType;
    prompt_text: string;
    options: McqOption[] | null;
  }>(
    `SELECT id, step_order, step_type, prompt_text, options
       FROM problem_steps
      WHERE variant_id=$1
      ORDER BY step_order ASC`,
    [variantId],
  );

  const publicSteps: PublicStep[] = stepsResult.rows.map(row => ({
    id: row.id,
    step_order: row.step_order,
    step_type: row.step_type,
    prompt_text: row.prompt_text,
    options: row.options
      ? row.options.map(o => ({ key: o.key, text: o.text }))   // strip is_correct
      : null,
  }));

  // If the caller provides a session_id, include the active step position.
  const { session_id } = (req.query ?? {}) as { session_id?: string };
  let currentStepId: string | null = null;
  if (session_id) {
    const redisSession = await getSession(session_id);
    currentStepId = redisSession?.current_step_id ?? null;
  }

  res.status(200).json({
    problem_id: problemId,
    variant_id: variantId,
    learner_profile: profile,
    total_steps: publicSteps.length,
    current_step_id: currentStepId,
    steps: publicSteps,
  });
}

// POST /api/problems/:id/steps/:stepId/submit
// Body: { session_id, submitted_value, time_spent_s }
export async function submitStep(req: Request, res: Response): Promise<void> {
  const studentId = (req as AuthRequest).studentId;
  const { id: problemId, stepId } = req.params;
  const { session_id, submitted_value, time_spent_s } = req.body as {
    session_id?: string;
    submitted_value?: string | number;
    time_spent_s?: number;
  };

  if (!session_id || submitted_value === undefined || time_spent_s === undefined) {
    res.status(400).json({ error: 'session_id, submitted_value, and time_spent_s are required' });
    return;
  }

  // Verify step belongs to the problem in the URL — cross-problem step IDs are rejected.
  const stepRow = await pool.query<{
    id: string;
    step_type: StepType;
    options: McqOption[] | null;
    ground_truth_answer: number | null;
    tolerance: number | null;
  }>(
    `SELECT s.id, s.step_type, s.options, s.ground_truth_answer, s.tolerance
       FROM problem_steps s
       JOIN problem_variants v ON v.id = s.variant_id
      WHERE s.id = $1 AND v.problem_id = $2`,
    [stepId, problemId],
  );
  if (stepRow.rows.length === 0) {
    res.status(404).json({ error: 'Step not found for this problem' });
    return;
  }
  const step = stepRow.rows[0];

  // Grade
  let correct: boolean | null;
  switch (step.step_type) {
    case 'mcq': {
      const selected = String(submitted_value).trim().toUpperCase();
      const opt = step.options?.find(o => o.key.toUpperCase() === selected);
      correct = opt ? opt.is_correct : false;
      break;
    }
    case 'numeric': {
      if (step.ground_truth_answer === null) {
        correct = null;                                              // ungraded placeholder
      } else {
        const submitted   = Number(submitted_value);
        const groundTruth = Number(step.ground_truth_answer);
        const tolerance   = step.tolerance ?? 0.01;
        if (!Number.isFinite(submitted) || groundTruth === 0) {
          correct = !Number.isFinite(submitted) ? false : submitted === 0;
        } else {
          correct = Math.abs(submitted - groundTruth) / Math.abs(groundTruth) <= tolerance;
        }
      }
      break;
    }
    case 'planning':
    case 'open':
      correct = true;                                                // acknowledgment-only
      break;
  }

  await pool.query(
    `INSERT INTO problem_step_attempts
       (session_id, student_id, step_id, submitted_value, correct, time_spent_s)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [session_id, studentId, stepId, String(submitted_value), correct, time_spent_s],
  );

  let attemptMetadata = {};
  if (correct === false) {
    const attemptRow = await pool.query<{ attempts_used: number }>(
      `SELECT COUNT(*)::int AS attempts_used
         FROM problem_step_attempts
        WHERE session_id = $1
          AND student_id = $2
          AND step_id = $3
          AND correct = false`,
      [session_id, studentId, stepId],
    );
    const attemptsUsed = Number(attemptRow.rows[0]?.attempts_used ?? 0);
    attemptMetadata = {
      attempt_budget: STEP_ATTEMPT_BUDGET,
      attempts_used: attemptsUsed,
      attempts_remaining: Math.max(0, STEP_ATTEMPT_BUDGET - attemptsUsed),
    };
  }

  // Advance current_step_id in Redis when the answer is accepted (correct or ungraded).
  let nextStepId: string | null = null;
  if (correct !== false) {
    const nextRow = await pool.query<{ id: string }>(
      `SELECT s2.id
         FROM problem_steps s1
         JOIN problem_steps s2 ON s2.variant_id = s1.variant_id
                               AND s2.step_order = s1.step_order + 1
        WHERE s1.id = $1`,
      [stepId],
    );
    nextStepId = nextRow.rows[0]?.id ?? null;

    const redisSession = await getSession(session_id);
    if (redisSession) {
      await setSession(session_id, { ...redisSession, current_step_id: nextStepId ?? stepId });
    }

    // Persist to Postgres so session restore picks up the right step on cache miss.
    await pool.query(
      'UPDATE sessions SET current_step_id = $1 WHERE id = $2',
      [nextStepId ?? stepId, session_id],
    );
  }

  res.status(200).json({
    correct,
    ungraded: correct === null,
    next_step_id: correct !== false ? nextStepId : null,
    misconception_hint: null,                                        // wired in Sprint 3
    ...attemptMetadata,
  });
}
