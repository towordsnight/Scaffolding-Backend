// One-time script to seed the problem bank.
// Run: npx tsx scripts/import-problems.ts

import 'dotenv/config';
import pool from '../src/db/client';

const problems = [
  // ── KVL ──────────────────────────────────────────────────────────────────
  {
    topic: 'kvl',
    difficulty: 'easy',
    problem_text:
      'A series circuit contains a 12 V source, a 3 Ω resistor, and a 1 Ω resistor. ' +
      'Using KVL, what is the voltage drop across the 3 Ω resistor? (answer in Volts)',
    ground_truth_answer: 9,
    tolerance: 0.01,
    error_taxonomy: ['sign_error', 'wrong_loop_direction', 'missed_element'],
  },
  {
    topic: 'kvl',
    difficulty: 'medium',
    problem_text:
      'A single-loop circuit has a 24 V source, a 6 Ω resistor, and an unknown resistor Rx. ' +
      'The measured current is 2 A. What is the resistance of Rx? (answer in Ohms)',
    ground_truth_answer: 6,
    tolerance: 0.01,
    error_taxonomy: ['sign_error', 'ohms_law_error', 'wrong_loop_direction'],
  },
  {
    topic: 'kvl',
    difficulty: 'hard',
    problem_text:
      'A two-mesh circuit: Mesh 1 has a 10 V source and a 2 Ω resistor, Mesh 2 has a 5 V source ' +
      'and a 3 Ω resistor, and a 4 Ω resistor is shared between the two meshes. ' +
      'Both sources drive current clockwise. Apply mesh analysis and solve for mesh current I1. (answer in Amperes)',
    ground_truth_answer: 3.46,
    tolerance: 0.02,
    error_taxonomy: ['sign_error', 'wrong_shared_branch', 'missed_element', 'wrong_loop_direction'],
  },

  // ── KCL ──────────────────────────────────────────────────────────────────
  {
    topic: 'kcl',
    difficulty: 'easy',
    problem_text:
      'At a circuit node, 5 A enters from one branch, 2 A leaves through a second branch, ' +
      'and the current Ix leaves through a third branch. Using KCL, find Ix. (answer in Amperes)',
    ground_truth_answer: 3,
    tolerance: 0.01,
    error_taxonomy: ['sign_error', 'wrong_reference_node', 'missed_branch'],
  },
  {
    topic: 'kcl',
    difficulty: 'medium',
    problem_text:
      'Node A is driven by a 10 mA current source. Two resistors connect node A to ground: ' +
      'a 2 kΩ resistor and a 4 kΩ resistor (both in parallel to ground). ' +
      'Apply KCL to find the voltage at node A. (answer in Volts)',
    ground_truth_answer: 13.333,
    tolerance: 0.01,
    error_taxonomy: ['sign_error', 'conductance_reciprocal_error', 'wrong_reference_node'],
  },
  {
    topic: 'kcl',
    difficulty: 'hard',
    problem_text:
      'A circuit has three nodes: a fixed voltage V1 = 20 V, an unknown voltage V2, and ground (0 V). ' +
      'A 4 Ω resistor connects V1 to V2, an 8 Ω resistor connects V2 to ground, ' +
      'and a 3 A independent current source injects current into node V2. ' +
      'Apply KCL at node V2 to find V2. (answer in Volts)',
    ground_truth_answer: 21.333,
    tolerance: 0.01,
    error_taxonomy: ['sign_error', 'current_source_direction_error', 'wrong_reference_node'],
  },

  // ── PHASORS ───────────────────────────────────────────────────────────────
  {
    topic: 'phasors',
    difficulty: 'easy',
    problem_text:
      'Convert the sinusoidal voltage v(t) = 10 cos(1000t + 30°) to phasor form. ' +
      'What is the magnitude of the phasor? (answer in Volts)',
    ground_truth_answer: 10,
    tolerance: 0.01,
    error_taxonomy: ['rms_vs_peak_error', 'angle_sign_error', 'sin_cos_confusion'],
  },
  {
    topic: 'phasors',
    difficulty: 'medium',
    problem_text:
      'Two phasor voltages are V1 = 5∠30° V and V2 = 5∠−30° V. ' +
      'Compute V1 + V2 and give the magnitude of the result. (answer in Volts)',
    ground_truth_answer: 8.66,
    tolerance: 0.01,
    error_taxonomy: ['component_addition_error', 'angle_arithmetic_error', 'rms_vs_peak_error'],
  },
  {
    topic: 'phasors',
    difficulty: 'hard',
    problem_text:
      'A phasor voltage V = 100∠45° V is applied across an impedance Z = 50∠30° Ω. ' +
      'Use phasor Ohm\'s law (I = V / Z) and find the magnitude of the phasor current. (answer in Amperes)',
    ground_truth_answer: 2,
    tolerance: 0.01,
    error_taxonomy: ['impedance_division_error', 'angle_arithmetic_error', 'ohms_law_phasor_error'],
  },

  // ── IMPEDANCE ─────────────────────────────────────────────────────────────
  {
    topic: 'impedance',
    difficulty: 'easy',
    problem_text:
      'A 100 Ω resistor and a capacitor with reactance Xc = 100 Ω are connected in series. ' +
      'What is the magnitude of the total impedance? (answer in Ohms)',
    ground_truth_answer: 141.42,
    tolerance: 0.01,
    error_taxonomy: ['arithmetic_add_instead_of_magnitude', 'sign_error_reactance', 'forgot_j'],
  },
  {
    topic: 'impedance',
    difficulty: 'medium',
    problem_text:
      'At ω = 1000 rad/s, a 10 mH inductor is connected in series with a 100 Ω resistor. ' +
      'Compute the inductor reactance and then find the magnitude of the series impedance. (answer in Ohms)',
    ground_truth_answer: 100.499,
    tolerance: 0.01,
    error_taxonomy: ['wrong_reactance_formula', 'arithmetic_add_instead_of_magnitude', 'unit_error'],
  },
  {
    topic: 'impedance',
    difficulty: 'hard',
    problem_text:
      'A 200 Ω resistor and a capacitor with reactance Xc = 100 Ω are connected in parallel. ' +
      'Find the magnitude of the equivalent parallel impedance. (answer in Ohms)',
    ground_truth_answer: 89.44,
    tolerance: 0.01,
    error_taxonomy: ['parallel_vs_series_formula', 'complex_arithmetic_error', 'forgot_j'],
  },
];

async function main() {
  const force = process.argv.includes('--force');
  const client = await pool.connect();
  try {
    const existing = await client.query<{ count: string }>('SELECT count(*)::text AS count FROM problems');
    if (parseInt(existing.rows[0].count, 10) > 0 && !force) {
      console.log(`Problem bank already seeded (${existing.rows[0].count} rows). Run with --force to re-seed.`);
      return;
    }
    if (force) {
      // TRUNCATE bypasses the append-only DO INSTEAD NOTHING rules on audit tables.
      // CASCADE handles problem_variants and problem_steps automatically.
      await client.query('TRUNCATE problem_step_attempts, hint_events, problem_attempts, sessions RESTART IDENTITY CASCADE');
      await client.query('TRUNCATE problems RESTART IDENTITY CASCADE');
      console.log('Cleared existing problems and dependent rows.');
    }

    let inserted = 0;
    for (const p of problems) {
      const result = await client.query(
        `INSERT INTO problems (topic, difficulty, problem_text, ground_truth_answer, tolerance, error_taxonomy)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [p.topic, p.difficulty, p.problem_text, p.ground_truth_answer, p.tolerance, p.error_taxonomy],
      );
      if (result.rows.length > 0) inserted++;
    }
    console.log(`Done. Inserted ${inserted} / ${problems.length} problems (duplicates skipped).`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
