import pool from '../client';
import type { StudentProfile, Topic } from '../../types/schema';

export async function loadStudentProfile(studentId: string): Promise<StudentProfile | null> {
  const result = await pool.query<StudentProfile>(
    `SELECT
       id, display_name, adhd_flag, cold_start_done, consent_given_at,
       course_level, learner_profile, sessions_completed,
       stress_level, focus_quality, idle_streak_s, consecutive_errors, self_report_weight,
       idle_threshold_s, error_threshold, hint_budget, response_length_budget
     FROM student_profile
     WHERE id = $1`,
    [studentId],
  );
  return result.rows[0] ?? null;
}

export interface ProblemForHint {
  id: string;
  topic: Topic;
  problem_text: string;
  error_taxonomy: string[];
}

export async function loadProblemForHint(problemId: string): Promise<ProblemForHint | null> {
  const result = await pool.query<ProblemForHint>(
    `SELECT id, topic, problem_text, error_taxonomy
     FROM problems
     WHERE id = $1`,
    [problemId],
  );
  return result.rows[0] ?? null;
}
