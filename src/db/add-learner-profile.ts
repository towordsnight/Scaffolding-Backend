// One-time migration: adds learner_profile enum + column to the students table.
// Run with: node --import tsx src/db/add-learner-profile.ts
import pool from './client';

async function run(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'learner_profile') THEN
          CREATE TYPE learner_profile AS ENUM ('starter', 'exploring', 'distracted', 'independent');
        END IF;
      END
      $$;
    `);

    await client.query(`
      ALTER TABLE students
        ADD COLUMN IF NOT EXISTS learner_profile learner_profile;
    `);

    console.log('Done: learner_profile enum + column added.');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
