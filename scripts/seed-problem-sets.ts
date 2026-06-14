// Seeds problem_sets and links existing problems to them.
// Safe to re-run — skips sets that already exist by name.
// Run: node --import tsx scripts/seed-problem-sets.ts
import 'dotenv/config';
import pool from '../src/db/client';

const SETS = [
  {
    name: 'ECE Circuit Analysis — Thévenin Equivalent',
    course_level: 'advanced',
    topic: 'thevenin',
    problem_topic: 'thevenin',
    problem_difficulty: null,   // pick all
  },
  {
    name: 'ECE Circuit Analysis — KVL',
    course_level: 'intro',
    topic: 'kvl',
    problem_topic: 'kvl',
    problem_difficulty: null,
  },
  {
    name: 'ECE Circuit Analysis — KCL',
    course_level: 'intro',
    topic: 'kcl',
    problem_topic: 'kcl',
    problem_difficulty: null,
  },
  {
    name: 'ECE Circuit Analysis — Phasors',
    course_level: 'intermediate',
    topic: 'phasors',
    problem_topic: 'phasors',
    problem_difficulty: null,
  },
  {
    name: 'ECE Circuit Analysis — Impedance',
    course_level: 'intermediate',
    topic: 'impedance',
    problem_topic: 'impedance',
    problem_difficulty: null,
  },
];

async function main(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let setsCreated = 0;
    let linksCreated = 0;

    for (const set of SETS) {
      // Idempotent: skip if already exists
      const existing = await client.query<{ id: string }>(
        'SELECT id FROM problem_sets WHERE name = $1',
        [set.name],
      );
      if (existing.rows.length > 0) {
        console.log(`  skip  "${set.name}" (already exists)`);
        continue;
      }

      const setResult = await client.query<{ id: string }>(
        `INSERT INTO problem_sets (name, course_level, topic) VALUES ($1, $2, $3) RETURNING id`,
        [set.name, set.course_level, set.topic],
      );
      const setId = setResult.rows[0].id;
      setsCreated++;

      // Link matching problems
      const problems = await client.query<{ id: string }>(
        `SELECT id FROM problems WHERE topic = $1 ORDER BY created_at`,
        [set.problem_topic],
      );
      for (const p of problems.rows) {
        await client.query(
          'UPDATE problems SET problem_set_id = $1 WHERE id = $2 AND problem_set_id IS NULL',
          [setId, p.id],
        );
        linksCreated++;
      }

      console.log(`  added "${set.name}" → ${problems.rows.length} problem(s)`);
    }

    await client.query('COMMIT');
    console.log(`Done. Created ${setsCreated} sets, linked ${linksCreated} problems.`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
