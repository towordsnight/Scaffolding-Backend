import pool from '../db/client';

interface SkillUpdateInput {
  correct: boolean;
  hintsUsed: number;
  hintBudgetExhausted: boolean;
}

// Applies hysteresis tier logic per CLAUDE.md:
//   solved with 0 hints         → consecutive_up++; at 2 → tier up
//   hint budget exhausted        → consecutive_down++; at 2 → tier down
//   solved with hints (not exh.) → reset both counters, no tier change
//   incorrect, budget not exh.   → no counter change
export async function updateSkillTier(
  studentId: string,
  topic: string,
  input: SkillUpdateInput,
): Promise<void> {
  const { correct, hintsUsed, hintBudgetExhausted } = input;

  const row = await pool.query<{
    tier: number;
    consecutive_up: number;
    consecutive_down: number;
  }>(
    'SELECT tier, consecutive_up, consecutive_down FROM student_skills WHERE student_id=$1 AND topic=$2',
    [studentId, topic],
  );

  if (row.rows.length === 0) return;

  let { tier, consecutive_up, consecutive_down } = row.rows[0];

  if (correct && hintsUsed === 0) {
    consecutive_up += 1;
    consecutive_down = 0;
    if (consecutive_up >= 2) {
      tier = Math.min(3, tier + 1);
      consecutive_up = 0;
    }
  } else if (hintBudgetExhausted) {
    consecutive_down += 1;
    consecutive_up = 0;
    if (consecutive_down >= 2) {
      tier = Math.max(0, tier - 1);
      consecutive_down = 0;
    }
  } else if (correct && hintsUsed > 0) {
    consecutive_up = 0;
    consecutive_down = 0;
  }

  await pool.query(
    `UPDATE student_skills
        SET tier=$1, consecutive_up=$2, consecutive_down=$3, updated_at=now()
      WHERE student_id=$4 AND topic=$5`,
    [tier, consecutive_up, consecutive_down, studentId, topic],
  );
}
