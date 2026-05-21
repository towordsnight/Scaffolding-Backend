import { Response } from 'express';
import pool from '../../db/client';
import { AuthRequest } from '../auth/middleware';

interface ProblemInSet {
  id: string;
  topic: string;
  difficulty: string;
  problem_text: string;
  attempted: boolean;
}

interface HomeworkSetRow {
  id: string;
  name: string;
  course_level: string;
  topic: string | null;
  problems: ProblemInSet[];
}

// GET /api/homework-sets
// Returns all problem sets with their problems and a per-student attempted flag.
// "attempted" is true if the student has any step attempt on that problem.
export async function listHomeworkSets(req: AuthRequest, res: Response): Promise<void> {
  const studentId = req.studentId;

  const result = await pool.query<HomeworkSetRow>(
    `SELECT
       ps.id,
       ps.name,
       ps.course_level,
       ps.topic,
       COALESCE(
         json_agg(
           json_build_object(
             'id',           p.id,
             'topic',        p.topic,
             'difficulty',   p.difficulty,
             'problem_text', p.problem_text,
             'attempted',    (att.attempt_count IS NOT NULL AND att.attempt_count > 0)
           ) ORDER BY p.created_at
         ) FILTER (WHERE p.id IS NOT NULL),
         '[]'
       ) AS problems
     FROM problem_sets ps
     LEFT JOIN problems p ON p.problem_set_id = ps.id
     LEFT JOIN (
       SELECT pv.problem_id, COUNT(*) AS attempt_count
         FROM problem_step_attempts psa
         JOIN problem_steps       pst ON pst.id  = psa.step_id
         JOIN problem_variants    pv  ON pv.id   = pst.variant_id
        WHERE psa.student_id = $1
        GROUP BY pv.problem_id
     ) att ON att.problem_id = p.id
     GROUP BY ps.id
     ORDER BY ps.created_at`,
    [studentId],
  );

  res.status(200).json(result.rows);
}
