// Migration: changes the five construct score columns from SMALLINT 0–2 to REAL 1–5,
// and adds profile_confidence + classification_flag columns.
// Run with: node --import tsx src/db/update-survey-score-columns.ts
import pool from './client';

async function run(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Values outside 1–5 are from the old 0/1/2 scale — NULL them out during the cast.
    await client.query(`
      ALTER TABLE students
        ALTER COLUMN attention_score       TYPE REAL USING CASE WHEN attention_score       BETWEEN 1 AND 5 THEN attention_score::REAL       ELSE NULL END,
        ALTER COLUMN autonomy_score        TYPE REAL USING CASE WHEN autonomy_score        BETWEEN 1 AND 5 THEN autonomy_score::REAL        ELSE NULL END,
        ALTER COLUMN competence_score      TYPE REAL USING CASE WHEN competence_score      BETWEEN 1 AND 5 THEN competence_score::REAL      ELSE NULL END,
        ALTER COLUMN self_regulation_score TYPE REAL USING CASE WHEN self_regulation_score BETWEEN 1 AND 5 THEN self_regulation_score::REAL ELSE NULL END,
        ALTER COLUMN self_efficacy_score   TYPE REAL USING CASE WHEN self_efficacy_score   BETWEEN 1 AND 5 THEN self_efficacy_score::REAL   ELSE NULL END;
    `);

    // Drop old 0–2 constraints (auto-named by Postgres)
    await client.query(`
      ALTER TABLE students
        DROP CONSTRAINT IF EXISTS students_attention_score_check,
        DROP CONSTRAINT IF EXISTS students_autonomy_score_check,
        DROP CONSTRAINT IF EXISTS students_competence_score_check,
        DROP CONSTRAINT IF EXISTS students_self_regulation_score_check,
        DROP CONSTRAINT IF EXISTS students_self_efficacy_score_check;
    `);

    // Add new 1–5 constraints
    await client.query(`
      ALTER TABLE students
        ADD CONSTRAINT students_attention_score_check       CHECK (attention_score       BETWEEN 1 AND 5),
        ADD CONSTRAINT students_autonomy_score_check        CHECK (autonomy_score        BETWEEN 1 AND 5),
        ADD CONSTRAINT students_competence_score_check      CHECK (competence_score      BETWEEN 1 AND 5),
        ADD CONSTRAINT students_self_regulation_score_check CHECK (self_regulation_score BETWEEN 1 AND 5),
        ADD CONSTRAINT students_self_efficacy_score_check   CHECK (self_efficacy_score   BETWEEN 1 AND 5);
    `);

    await client.query(`
      ALTER TABLE students
        ADD COLUMN IF NOT EXISTS profile_confidence  REAL CHECK (profile_confidence BETWEEN 0 AND 1),
        ADD COLUMN IF NOT EXISTS classification_flag TEXT;
    `);

    await client.query('COMMIT');
    console.log('Done: survey score columns migrated to REAL 1–5; profile_confidence and classification_flag added.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => { console.error('Migration failed:', err); process.exit(1); });
