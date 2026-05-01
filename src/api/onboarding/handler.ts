import { Request, Response } from 'express';
import crypto from 'crypto';
import pool from '../../db/client';
import { AuthRequest } from '../auth/middleware';
import type { CourseLevel, Topic } from '../../types/schema';

// Which 3 topics to use for cold-start diagnostics per course level
const DIAGNOSTIC_TOPICS: Record<CourseLevel, Topic[]> = {
  intro:        ['kvl', 'kcl', 'phasors'],
  intermediate: ['kcl', 'phasors', 'impedance'],
  advanced:     ['phasors', 'impedance', 'kvl'],
};

const DIAGNOSTIC_DIFFICULTY: Record<CourseLevel, string> = {
  intro:        'easy',
  intermediate: 'medium',
  advanced:     'hard',
};

// POST /api/onboarding/declaration
// Body: { adhd_flag, stress_baseline (0|1|2), course_level }
// Constraint #2: consent_given_at must be set before this proceeds.
export async function declaration(req: Request, res: Response): Promise<void> {
  const studentId = (req as AuthRequest).studentId;
  const { adhd_flag, stress_baseline, course_level } = req.body as {
    adhd_flag?: boolean;
    stress_baseline?: number;
    course_level?: CourseLevel;
  };

  if (adhd_flag === undefined || stress_baseline === undefined || !course_level) {
    res.status(400).json({ error: 'adhd_flag, stress_baseline, and course_level are required' });
    return;
  }

  if (![0, 1, 2].includes(stress_baseline)) {
    res.status(400).json({ error: 'stress_baseline must be 0, 1, or 2' });
    return;
  }

  const validLevels: CourseLevel[] = ['intro', 'intermediate', 'advanced'];
  if (!validLevels.includes(course_level)) {
    res.status(400).json({ error: 'course_level must be intro, intermediate, or advanced' });
    return;
  }

  // Constraint #2: require consent before onboarding writes
  const consentRow = await pool.query<{ consent_given_at: Date | null }>(
    'SELECT consent_given_at FROM students WHERE id = $1',
    [studentId],
  );
  if (!consentRow.rows[0]?.consent_given_at) {
    res.status(403).json({ error: 'Consent required before onboarding. Please accept the privacy notice first.' });
    return;
  }

  // Compute adaptive thresholds at write time (Constraint #6)
  const isHighNeed = Boolean(adhd_flag) || stress_baseline === 2;
  const isAdvanced = course_level === 'advanced';
  const idleThreshold  = isHighNeed ? 60  : isAdvanced ? 180 : 90;
  const errorThreshold = isHighNeed ? 2   : isAdvanced ? 4   : 3;
  const hintBudget     = isHighNeed ? 4   : isAdvanced ? 2   : 3;
  const responseLength = isHighNeed ? 'brief' : isAdvanced ? 'short' : 'medium';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE students SET adhd_flag=$1, course_level=$2, updated_at=now() WHERE id=$3`,
      [Boolean(adhd_flag), course_level, studentId],
    );

    await client.query(
      `UPDATE cognitive_state SET stress_level=$1, updated_at=now() WHERE student_id=$2`,
      [stress_baseline, studentId],
    );

    await client.query(
      `UPDATE adaptive_config
         SET idle_threshold_s=$1, error_threshold=$2, hint_budget=$3,
             response_length_budget=$4, updated_at=now()
       WHERE student_id=$5`,
      [idleThreshold, errorThreshold, hintBudget, responseLength, studentId],
    );

    await client.query('COMMIT');
    res.status(200).json({ declared: true });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// GET /api/onboarding/problems
// Returns the 3 diagnostic problems for the student's course level.
export async function getDiagnosticProblems(req: Request, res: Response): Promise<void> {
  const studentId = (req as AuthRequest).studentId;

  const studentRow = await pool.query<{
    course_level: CourseLevel;
    cold_start_done: boolean;
    consent_given_at: Date | null;
  }>(
    'SELECT course_level, cold_start_done, consent_given_at FROM students WHERE id=$1',
    [studentId],
  );
  const student = studentRow.rows[0];

  if (!student?.consent_given_at) {
    res.status(403).json({ error: 'Consent required' });
    return;
  }
  if (student.cold_start_done) {
    res.status(409).json({ error: 'Onboarding already completed' });
    return;
  }

  const topics    = DIAGNOSTIC_TOPICS[student.course_level];
  const difficulty = DIAGNOSTIC_DIFFICULTY[student.course_level];

  const problems = await Promise.all(
    topics.map(topic =>
      pool
        .query<{ id: string; topic: string; difficulty: string; problem_text: string; error_taxonomy: string[] }>(
          `SELECT id, topic, difficulty, problem_text, error_taxonomy
           FROM problems
           WHERE topic=$1 AND difficulty=$2
           ORDER BY random()
           LIMIT 1`,
          [topic, difficulty],
        )
        .then(r => r.rows[0] ?? null),
    ),
  );

  if (problems.some(p => p === null)) {
    res.status(503).json({
      error: 'Problem bank not seeded for this course level. Run: npx tsx scripts/import-problems.ts',
    });
    return;
  }

  res.status(200).json({ problems });
}

// POST /api/onboarding/diagnostic
// Body: { answers: [{ problem_id, submitted_answer, time_spent_s }] }  (exactly 3 items)
// Evaluates each answer, writes skill tiers, marks cold_start_done.
export async function submitDiagnostic(req: Request, res: Response): Promise<void> {
  const studentId = (req as AuthRequest).studentId;
  const { answers } = req.body as {
    answers?: Array<{ problem_id: string; submitted_answer: number; time_spent_s: number }>;
  };

  if (!Array.isArray(answers) || answers.length !== 3) {
    res.status(400).json({ error: 'answers must be an array of exactly 3 items' });
    return;
  }

  const studentRow = await pool.query<{ consent_given_at: Date | null; cold_start_done: boolean }>(
    'SELECT consent_given_at, cold_start_done FROM students WHERE id=$1',
    [studentId],
  );
  const student = studentRow.rows[0];

  if (!student?.consent_given_at) {
    res.status(403).json({ error: 'Consent required' });
    return;
  }
  if (student.cold_start_done) {
    res.status(409).json({ error: 'Onboarding already completed' });
    return;
  }

  // Fetch all referenced problems in one query
  const ids = answers.map(a => a.problem_id);
  const problemsResult = await pool.query<{
    id: string;
    topic: string;
    ground_truth_answer: number;
    tolerance: number;
  }>(
    'SELECT id, topic, ground_truth_answer, tolerance FROM problems WHERE id = ANY($1)',
    [ids],
  );
  const problemMap = new Map(problemsResult.rows.map(p => [p.id, p]));

  if (problemMap.size !== 3) {
    res.status(400).json({ error: 'One or more problem IDs not found' });
    return;
  }

  // Create an onboarding session to satisfy FK constraints on problem_attempts
  const sessionResult = await pool.query<{ id: string }>(
    'INSERT INTO sessions (student_id) VALUES ($1) RETURNING id',
    [studentId],
  );
  const sessionId = sessionResult.rows[0].id;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const results: Array<{ problem_id: string; topic: string; correct: boolean }> = [];

    for (const answer of answers) {
      const problem = problemMap.get(answer.problem_id);
      if (!problem) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: `Problem ${answer.problem_id} not found` });
        return;
      }

      // Constraint #4: numeric tolerance, never string match
      const groundTruth = Number(problem.ground_truth_answer);
      const submitted   = Number(answer.submitted_answer);
      const correct     = Math.abs(submitted - groundTruth) / groundTruth <= problem.tolerance;

      const skillRow = await client.query<{ tier: number }>(
        'SELECT tier FROM student_skills WHERE student_id=$1 AND topic=$2',
        [studentId, problem.topic],
      );
      const currentTier = skillRow.rows[0]?.tier ?? 1;

      await client.query(
        `INSERT INTO problem_attempts
           (session_id, problem_id, student_id, submitted_answer, outcome, time_spent_s, skill_tier_at_attempt)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [sessionId, answer.problem_id, studentId, String(answer.submitted_answer), correct, answer.time_spent_s, currentTier],
      );

      // Cold-start tier heuristic: correct → tier 2, incorrect → tier 1
      const newTier = correct ? 2 : 1;
      await client.query(
        'UPDATE student_skills SET tier=$1, updated_at=now() WHERE student_id=$2 AND topic=$3',
        [newTier, studentId, problem.topic],
      );

      results.push({ problem_id: answer.problem_id, topic: problem.topic, correct });
    }

    await client.query(
      'UPDATE students SET cold_start_done=true, updated_at=now() WHERE id=$1',
      [studentId],
    );

    await client.query('COMMIT');
    res.status(200).json({ completed: true, session_id: sessionId, results });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// POST /api/onboarding/consent
// Body: { consent: boolean }
// Always appends to consent_log (append-only audit trail).
// Sets consent_given_at only when consent=true and not already set (idempotent).
export async function acceptConsent(req: Request, res: Response): Promise<void> {
  const studentId = (req as AuthRequest).studentId;
  const { consent } = req.body as { consent?: boolean };

  if (typeof consent !== 'boolean') {
    res.status(400).json({ error: 'consent (boolean) is required' });
    return;
  }

  const ipRaw = req.ip ?? '';
  const ipHash = ipRaw ? crypto.createHash('sha256').update(ipRaw).digest('hex') : null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO consent_log (student_id, consent_type, granted, ip_hash) VALUES ($1, 'ferpa', $2, $3)`,
      [studentId, consent, ipHash],
    );

    if (consent) {
      await client.query(
        `UPDATE students SET consent_given_at = now() WHERE id = $1 AND consent_given_at IS NULL`,
        [studentId],
      );
    }

    await client.query('COMMIT');
    res.status(200).json({ consented: consent });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
