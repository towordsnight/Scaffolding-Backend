// Deploys schema.sql to the configured Postgres database.
// Run with: npm run migrate
// NOT idempotent: schema.sql uses bare CREATE TYPE / CREATE TABLE.
// Pre-flight check below aborts cleanly if the schema is already deployed.

import fs from 'fs';
import path from 'path';
import pool from './client';

async function migrate(): Promise<void> {
  const schemaPath = path.resolve(__dirname, '../../schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  const client = await pool.connect();
  try {
    // Abort if the 'topic' enum type already exists — schema was previously deployed.
    const check = await client.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM pg_type WHERE typname = 'topic'",
    );
    if (parseInt(check.rows[0].count, 10) > 0) {
      console.log('Schema already deployed (topic enum found). Skipping migration.');
      return;
    }

    console.log('Running migration from schema.sql...');
    await client.query(sql);
    console.log('Migration complete.');
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
