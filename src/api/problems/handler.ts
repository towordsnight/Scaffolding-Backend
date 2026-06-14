import { Request, Response } from 'express';
import pool from '../../db/client';
import { AuthRequest } from '../auth/middleware';
import { getSession, setSession } from '../../redis/session-store';
import { sessionBelongsToStudent } from '../../db/queries/sessions';
import { isAnswerCorrect } from '../../services/answer-checker';
import { updateSkillTier } from '../../services/skill-updater';
import { updateConsecutiveErrors } from '../../services/cognitive-state';
import { checkAfterSubmit } from '../../services/adaptive-engine';

// Ground truth fields are intentionally omitted from all public responses.
type ProblemPublic = {
  id: string;
  topic: string;
  difficulty: string;
  problem_text: string;
  error_taxonomy: string[];
  created_at: Date;
};

const SELECT_PUBLIC = `
  SELECT id, topic, difficulty, problem_text, error_taxonomy, created_at
  FROM problems
`;

// GET /api/problems/:id
export async function getProblem(req: Request, res: Response): Promise<void> {
  const { id } = req.params;

  const result = await pool.query<ProblemPublic>(SELECT_PUBLIC + ' WHERE id=$1', [id]);
  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Problem not found' });
    return;
  }

  res.status(200).json(result.rows[0]);
}

// GET /api/problems/next
// Picks the next problem based on the student's weakest skill tier.
export async function getNextProblem(req: Request, res: Response): Promise<void> {
  const studentId = (req as AuthRequest).studentId;

  const skillsResult = await pool.query<{ topic: string; tier: number }>(
    'SELECT topic, tier FROM student_skills WHERE student_id=$1',
    [studentId],
  );

  if (skillsResult.rows.length === 0) {
    res.status(400).json({ error: 'Skill vector not found. Complete onboarding first.' });
    return;
  }

  const weakest = skillsResult.rows.reduce((a, b) => (a.tier <= b.tier ? a : b));
  const difficultyMap: Record<number, string> = { 0: 'easy', 1: 'easy', 2: 'medium', 3: 'hard' };
  const difficulty = difficultyMap[weakest.tier] ?? 'easy';

  const result = await pool.query<ProblemPublic>(
    SELECT_PUBLIC + ' WHERE topic=$1 AND difficulty=$2 ORDER BY random() LIMIT 1',
    [weakest.topic, difficulty],
  );

  if (result.rows.length === 0) {
    res.status(404).json({ error: 'No problems available for current skill level' });
    return;
  }

  res.status(200).json(result.rows[0]);
}

// POST /api/problems/:id/submit
// Body: { session_id, submitted_answer, time_spent_s }
// Constraint #4: numeric tolerance, never string match.
// Logs to problem_attempts (append-only).
export async function submitAnswer(req: Request, res: Response): Promise<void> {
  const studentId = (req as AuthRequest).studentId;
  const { id: problemId } = req.params;
  const { session_id, submitted_answer, time_spent_s } = req.body as {
    session_id?: string;
    submitted_answer?: number;
    time_spent_s?: number;
  };

  if (!session_id || submitted_answer === undefined || time_spent_s === undefined) {
    res.status(400).json({ error: 'session_id, submitted_answer, and time_spent_s are required' });
    return;
  }

  // session_id is client-supplied: attempts must never land on another student's session.
  if (!(await sessionBelongsToStudent(session_id, studentId))) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  const problemResult = await pool.query<{
    topic: string;
    ground_truth_answer: number;
    tolerance: number;
  }>(
    'SELECT topic, ground_truth_answer, tolerance FROM problems WHERE id=$1',
    [problemId],
  );
  if (problemResult.rows.length === 0) {
    res.status(404).json({ error: 'Problem not found' });
    return;
  }

  const problem = problemResult.rows[0];
  const correct = isAnswerCorrect(
    Number(submitted_answer),
    Number(problem.ground_truth_answer),
    problem.tolerance,
  );

  const skillRow = await pool.query<{ tier: number }>(
    'SELECT tier FROM student_skills WHERE student_id=$1 AND topic=$2',
    [studentId, problem.topic],
  );
  const currentTier = skillRow.rows[0]?.tier ?? 1;

  await pool.query(
    `INSERT INTO problem_attempts
       (session_id, problem_id, student_id, submitted_answer, outcome, time_spent_s, skill_tier_at_attempt)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [session_id, problemId, studentId, String(submitted_answer), correct, time_spent_s, currentTier],
  );

  // Read hints used from Redis to drive skill-tier hysteresis
  const redisSession = await getSession(session_id);
  const hintsUsed = redisSession?.hints_used_this_problem ?? 0;

  const configRow = await pool.query<{ hint_budget: number }>(
    'SELECT hint_budget FROM adaptive_config WHERE student_id=$1',
    [studentId],
  );
  const hintBudget = configRow.rows[0]?.hint_budget ?? 3;
  const hintBudgetExhausted = hintsUsed >= hintBudget;

  await updateSkillTier(studentId, problem.topic, { correct, hintsUsed, hintBudgetExhausted });
  await updateConsecutiveErrors(studentId, correct);

  // Read updated consecutive_errors for threshold check
  const csRow = await pool.query<{ consecutive_errors: number }>(
    'SELECT consecutive_errors FROM cognitive_state WHERE student_id=$1',
    [studentId],
  );
  const consecutiveErrors = csRow.rows[0]?.consecutive_errors ?? 0;
  const intervention = await checkAfterSubmit(session_id, studentId, consecutiveErrors, hintsUsed);

  // Reset hints_used_this_problem in Redis for the next problem
  if (redisSession) {
    await setSession(session_id, { ...redisSession, hints_used_this_problem: 0 });
  }

  res.status(200).json({ correct, topic: problem.topic, intervention: intervention ?? null });
}
