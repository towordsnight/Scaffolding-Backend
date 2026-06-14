// One-time migration: adds 5 construct score columns to the students table.
// Scores are derived from the onboarding survey and stored as 0=low, 1=medium, 2=high.
// Nullable until a student completes the declaration step.
// Run with: node --import tsx src/db/add-survey-scores.ts
import pool from './client';

async function run(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      ALTER TABLE students
        ADD COLUMN IF NOT EXISTS attention_score       SMALLINT CHECK (attention_score       BETWEEN 0 AND 2),
        ADD COLUMN IF NOT EXISTS autonomy_score        SMALLINT CHECK (autonomy_score        BETWEEN 0 AND 2),
        ADD COLUMN IF NOT EXISTS competence_score      SMALLINT CHECK (competence_score      BETWEEN 0 AND 2),
        ADD COLUMN IF NOT EXISTS self_regulation_score SMALLINT CHECK (self_regulation_score BETWEEN 0 AND 2),
        ADD COLUMN IF NOT EXISTS self_efficacy_score   SMALLINT CHECK (self_efficacy_score   BETWEEN 0 AND 2);
    `);

    console.log('Done: survey score columns added to students.');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
