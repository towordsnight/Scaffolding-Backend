// Runs once before all integration test suites (separate Node process).
// Creates the scaffold_test database and applies schema.sql if not already present.

import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { Pool } from 'pg';

export default async function globalSetup(): Promise<void> {
  dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });

  const testDbUrl = process.env.DATABASE_URL!;

  // Derive admin URL by swapping the database name to 'postgres'.
  const adminUrl = testDbUrl.replace(/\/[^/?]+(\?|$)/, '/postgres$1');

  // Create scaffold_test if it doesn't exist.
  const adminPool = new Pool({ connectionString: adminUrl, ssl: false });
  const adminClient = await adminPool.connect();
  try {
    const exists = await adminClient.query(
      "SELECT 1 FROM pg_database WHERE datname = 'scaffold_test'",
    );
    if (exists.rows.length === 0) {
      // Cannot run CREATE DATABASE inside a transaction block.
      await adminClient.query('CREATE DATABASE scaffold_test');
      console.log('[globalSetup] Created scaffold_test database.');
    }
  } finally {
    adminClient.release();
    await adminPool.end();
  }

  // Apply schema.sql to scaffold_test if the 'topic' enum is not yet present.
  const testPool = new Pool({ connectionString: testDbUrl, ssl: false });
  const testClient = await testPool.connect();
  try {
    const check = await testClient.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM pg_type WHERE typname = 'topic'",
    );
    if (parseInt(check.rows[0].count, 10) === 0) {
      const schemaPath = path.resolve(__dirname, '../../schema.sql');
      const sql = fs.readFileSync(schemaPath, 'utf8');
      await testClient.query(sql);
      console.log('[globalSetup] Schema applied to scaffold_test.');
    }
  } finally {
    testClient.release();
    await testPool.end();
  }
}
