// One-time script to seed cohort_priors before launch.
// Run: npx tsx scripts/seed-cohort-priors.ts

import 'dotenv/config';
import pool from '../src/db/client';

const SEMESTER = '2026-spring';

// avg_tier estimates based on typical ECE cohort performance per course level.
// Tier scale: 0=no exposure, 1=intro, 2=proficient, 3=advanced
const priors: Array<{ course_level: string; topic: string; avg_tier: number }> = [
  // Intro — KVL/KCL known, phasors/impedance barely seen
  { course_level: 'intro', topic: 'kvl',       avg_tier: 1.4 },
  { course_level: 'intro', topic: 'kcl',       avg_tier: 1.3 },
  { course_level: 'intro', topic: 'phasors',   avg_tier: 0.8 },
  { course_level: 'intro', topic: 'impedance', avg_tier: 0.6 },

  // Intermediate — phasors/impedance in progress
  { course_level: 'intermediate', topic: 'kvl',       avg_tier: 2.1 },
  { course_level: 'intermediate', topic: 'kcl',       avg_tier: 2.0 },
  { course_level: 'intermediate', topic: 'phasors',   avg_tier: 1.5 },
  { course_level: 'intermediate', topic: 'impedance', avg_tier: 1.3 },

  // Advanced — all topics solid
  { course_level: 'advanced', topic: 'kvl',       avg_tier: 2.8 },
  { course_level: 'advanced', topic: 'kcl',       avg_tier: 2.7 },
  { course_level: 'advanced', topic: 'phasors',   avg_tier: 2.5 },
  { course_level: 'advanced', topic: 'impedance', avg_tier: 2.4 },
];

async function main() {
  const client = await pool.connect();
  try {
    let upserted = 0;
    for (const p of priors) {
      await client.query(
        `INSERT INTO cohort_priors (course_level, topic, semester, avg_tier)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (course_level, topic, semester)
         DO UPDATE SET avg_tier = EXCLUDED.avg_tier`,
        [p.course_level, p.topic, SEMESTER, p.avg_tier],
      );
      upserted++;
    }
    console.log(`Done. Upserted ${upserted} cohort priors for semester ${SEMESTER}.`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
