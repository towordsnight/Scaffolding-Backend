import { Request, Response } from 'express';
import crypto from 'crypto';
import pool from '../../db/client';
import { AuthRequest } from '../auth/middleware';
import type { CourseLevel, Topic } from '../../types/schema';
import { classifyProfile, toLevel } from '../../services/profile-classifier';
import { isAnswerCorrect } from '../../services/answer-checker';

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
// Body: { adhd_flag, course_level, attention_score, autonomy_score, competence_score,
//         self_regulation_score, self_efficacy_score }
// All five scores are raw 1–5 averages from the onboarding survey.
// Constraint #2: consent_given_at must be set before this proceeds.
export async function declaration(req: Request, res: Response): Promise<void> {
  const studentId = (req as AuthRequest).studentId;
  const {
    adhd_flag,
    course_level,
    attention_score,
    autonomy_score,
    competence_score,
    self_regulation_score,
    self_efficacy_score,
  } = req.body as {
    adhd_flag?: boolean;
    course_level?: CourseLevel;
    attention_score?: number;
    autonomy_score?: number;
    competence_score?: number;
    self_regulation_score?: number;
    self_efficacy_score?: number;
  };

  if (
    adhd_flag === undefined ||
    !course_level ||
    attention_score === undefined ||
    autonomy_score === undefined ||
    competence_score === undefined ||
    self_regulation_score === undefined ||
    self_efficacy_score === undefined
  ) {
    res.status(400).json({
      error: 'adhd_flag, course_level, attention_score, autonomy_score, competence_score, self_regulation_score, and self_efficacy_score are required',
    });
    return;
  }

  const rawScores = { attention_score, autonomy_score, competence_score, self_regulation_score, self_efficacy_score };
  for (const [key, val] of Object.entries(rawScores)) {
    if (typeof val !== 'number' || val < 1 || val > 5) {
      res.status(400).json({ error: `${key} must be a number between 1 and 5` });
      return;
    }
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

  // Classify student profile from raw construct averages
  const classification = classifyProfile({
    attentionDifficulty: attention_score,
    autonomy:            autonomy_score,
    competence:          competence_score,
    selfRegulation:      self_regulation_score,
    selfEfficacy:        self_efficacy_score,
  });

  // Derive Low/Medium/High levels for adaptive threshold computation (Constraint #6)
  const attnLevel  = toLevel(attention_score);
  const srLevel    = toLevel(self_regulation_score);
  const autoLevel  = toLevel(autonomy_score);
  const seLevel    = toLevel(self_efficacy_score);
  const isAdvanced = course_level === 'advanced';

  // ADHD flag or high attention difficulty → high-need mode
  const isHighNeed = Boolean(adhd_flag) || attnLevel === 'high';

  // idle_threshold: self_regulation drives base (low=60s, med=90s, high=180s);
  // high-need always floors to 60s.
  const selfRegIdle   = srLevel === 'low' ? 60 : srLevel === 'medium' ? 90 : 180;
  const idleThreshold = isHighNeed ? 60 : Math.min(selfRegIdle, isAdvanced ? 180 : 90);

  const errorThreshold = isHighNeed ? 2 : isAdvanced ? 4 : 3;
  const hintBudget     = isHighNeed ? 4 : isAdvanced ? 2 : 3;

  // response_length: high-need → brief; high autonomy + not high-need → short; else medium.
  const responseLength: 'brief' | 'short' | 'medium' =
    isHighNeed ? 'brief' : autoLevel === 'high' ? 'short' : 'medium';

  // hint_depth: low self-efficacy → concrete hints; otherwise socratic.
  const hintDepth: 'concrete' | 'socratic' = seLevel === 'low' ? 'concrete' : 'socratic';

  // stress_level for cognitive_state maps Low→0, Medium→1, High→2
  const stressLevel = attnLevel === 'low' ? 0 : attnLevel === 'medium' ? 1 : 2;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE students
          SET adhd_flag=$1, course_level=$2,
              learner_profile=$3,
              attention_score=$4, autonomy_score=$5, competence_score=$6,
              self_regulation_score=$7, self_efficacy_score=$8,
              profile_confidence=$9, classification_flag=$10,
              updated_at=now()
        WHERE id=$11`,
      [
        Boolean(adhd_flag), course_level, classification.assignedProfile,
        attention_score, autonomy_score, competence_score,
        self_regulation_score, self_efficacy_score,
        classification.confidence, classification.flag,
        studentId,
      ],
    );

    await client.query(
      `UPDATE cognitive_state SET stress_level=$1, updated_at=now() WHERE student_id=$2`,
      [stressLevel, studentId],
    );

    await client.query(
      `UPDATE adaptive_config
         SET idle_threshold_s=$1, error_threshold=$2, hint_budget=$3,
             response_length_budget=$4, updated_at=now()
       WHERE student_id=$5`,
      [idleThreshold, errorThreshold, hintBudget, responseLength, studentId],
    );

    // Set initial hint depth across all skill topics from self-efficacy level.
    // Rows are pre-seeded on registration; this is a no-op when none exist yet.
    await client.query(
      `UPDATE student_skills SET hint_depth_preference=$1, updated_at=now() WHERE student_id=$2`,
      [hintDepth, studentId],
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
      const correct = isAnswerCorrect(
        Number(answer.submitted_answer),
        Number(problem.ground_truth_answer),
        problem.tolerance,
      );

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
