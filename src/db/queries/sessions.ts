import pool from '../client';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Ownership gate for endpoints that take session_id in the request body:
// audit rows must never be attributable to another student's session.
// The format guard keeps malformed IDs from throwing a uuid cast error in pg.
export async function sessionBelongsToStudent(
  sessionId: string,
  studentId: string,
): Promise<boolean> {
  if (!UUID_RE.test(sessionId)) return false;
  const result = await pool.query(
    'SELECT 1 FROM sessions WHERE id=$1 AND student_id=$2',
    [sessionId, studentId],
  );
  return result.rows.length > 0;
}
