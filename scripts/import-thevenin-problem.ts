// One-time script to seed the multi-step Thévenin problem with four
// profile-conditioned scaffold variants.
// Run: npx tsx scripts/import-thevenin-problem.ts
//
// Numeric ground truths (Vth, Isc, Rth, # essential nodes, # KCL equations)
// are intentionally left NULL — the instructor will fill them in later via SQL.

import 'dotenv/config';
import pool from '../src/db/client';
import type { LearnerProfile, McqOption, StepType } from '../src/types/schema';

const PROBLEM_TEXT =
  'Find the Thévenin equivalent with respect to the terminals a, b for the following circuit. ' +
  'Components: a 9 V independent voltage source, a 1.8 A independent current source, ' +
  'and resistors of 5 Ω, 20 Ω, 25 Ω, 60 Ω, and 10 Ω arranged as shown in the figure. ' +
  'Report Vth (volts) and Rth (ohms).';

interface StepSpec {
  step_type: StepType;
  prompt_text: string;
  options?: McqOption[];
  ground_truth_answer?: number;     // omit for ungraded numeric steps
  tolerance?: number;
}

const METHOD_OPTIONS: McqOption[] = [
  { key: 'A', text: 'Nodal',                is_correct: true  },
  { key: 'B', text: 'Mesh',                 is_correct: false },
  { key: 'C', text: 'Source Transformation', is_correct: false },
];

const RTH_METHOD_OPTIONS: McqOption[] = [
  { key: 'A', text: 'Find short-circuit current and then do Vth/Isc', is_correct: true  },
  { key: 'B', text: 'Dead-network analysis',                          is_correct: false },
  { key: 'C', text: 'Source Transformation',                          is_correct: false },
];

// ── Profile 1 (starter) — most heavily scaffolded ─────────────────────────────
const STARTER_STEPS: StepSpec[] = [
  { step_type: 'planning', prompt_text: 'The goal is to find the Thévenin equivalent at terminals a, b. Recall, what does the Thévenin equivalent model look like?' },
  { step_type: 'planning', prompt_text: 'What values do we need to find for the Thévenin equivalent model? (Vth and Rth)' },
  { step_type: 'planning', prompt_text: 'Let\'s start from finding Vth. Where is Vth in our diagram?' },
  { step_type: 'mcq',      prompt_text: 'What is the most helpful next step / technique for finding Vth?', options: METHOD_OPTIONS },
  { step_type: 'planning', prompt_text: 'A good next step is to choose a reference node. Choose the most convenient reference node (ground).' },
  { step_type: 'numeric',  prompt_text: 'How many essential nodes do we have in the circuit?' },
  { step_type: 'numeric',  prompt_text: 'How many KCL equations do we need to solve this problem?' },
  { step_type: 'open',     prompt_text: 'Write down the KCL equations and solve them.' },
  { step_type: 'numeric',  prompt_text: 'Find Vth (= Vab). Enter your value in volts.' },
  { step_type: 'mcq',      prompt_text: 'Now we need to find Rth. What is the most helpful next step / technique for finding Rth?', options: RTH_METHOD_OPTIONS },
  { step_type: 'open',     prompt_text: 'Redraw the circuit diagram and label all mesh currents / node voltages needed to determine the short-circuit current.' },
  { step_type: 'open',     prompt_text: 'Identify the supermesh in the circuit and write down the constraint equation.' },
  { step_type: 'open',     prompt_text: 'Write down the mesh-current equations and solve them.' },
  { step_type: 'numeric',  prompt_text: 'Find Isc (the short-circuit current). Enter your value in amperes.' },
  { step_type: 'numeric',  prompt_text: 'Find Rth (= Vth / Isc). Enter your value in ohms.' },
];

// ── Profile 2 (exploring) — less hand-holding, dual-path ──────────────────────
const EXPLORING_STEPS: StepSpec[] = [
  { step_type: 'planning', prompt_text: 'The goal is to find the Thévenin equivalent at terminals a, b.' },
  { step_type: 'planning', prompt_text: 'What values do we need to find for the Thévenin equivalent model? (Vth and Rth)' },
  { step_type: 'planning', prompt_text: 'To find Vth, what quantity do we need from the circuit? (Vab)' },
  { step_type: 'mcq',      prompt_text: 'Choose a method to find Vth.', options: METHOD_OPTIONS },
  { step_type: 'open',     prompt_text: 'Choose a reference node (ground). What makes this node convenient?' },
  { step_type: 'numeric',  prompt_text: 'How many KCL equations do we need to solve this problem?' },
  { step_type: 'open',     prompt_text: 'Write down the KCL equations and solve them.' },
  { step_type: 'numeric',  prompt_text: 'Enter Vth in volts.' },
  { step_type: 'planning', prompt_text: 'Now use the short-circuit current method for Rth. Short-circuit terminals a, b and redraw the circuit (a and b connected by a wire).' },
  { step_type: 'planning', prompt_text: 'What changes in the circuit after the short? (Vab = 0)' },
  { step_type: 'open',     prompt_text: 'Set up the equations needed to find Isc.' },
  { step_type: 'numeric',  prompt_text: 'Solve for Isc. Enter your value in amperes.' },
  { step_type: 'numeric',  prompt_text: 'Compute Rth = Vth / Isc. Enter your value in ohms.' },
];

// ── Profile 3 (distracted) — short prompts, continuous flow ───────────────────
const DISTRACTED_STEPS: StepSpec[] = [
  { step_type: 'planning', prompt_text: 'Goal: find the Thévenin equivalent at terminals a, b.' },
  { step_type: 'mcq',      prompt_text: 'First, find Vth using your preferred method.', options: METHOD_OPTIONS },
  { step_type: 'open',     prompt_text: 'Set up your circuit and choose a reference / ground node.' },
  { step_type: 'numeric',  prompt_text: 'Set up your KCL equations and enter your value for Vth (volts).' },
  { step_type: 'mcq',      prompt_text: 'Now find Rth using one of the following methods.', options: RTH_METHOD_OPTIONS },
  { step_type: 'numeric',  prompt_text: 'Write down the mesh-current equations and enter your value for Isc (amperes).' },
  { step_type: 'numeric',  prompt_text: 'Solve and enter your value for Rth (ohms).' },
];

// ── Profile 4 (independent) — minimal ────────────────────────────────────────
const INDEPENDENT_STEPS: StepSpec[] = [
  { step_type: 'planning', prompt_text: 'Goal: find the Thévenin equivalent at terminals a, b.' },
  { step_type: 'numeric',  prompt_text: 'Enter Vth in volts.' },
  { step_type: 'numeric',  prompt_text: 'Enter Rth in ohms.' },
];

const VARIANTS: Array<{ profile: LearnerProfile; steps: StepSpec[] }> = [
  { profile: 'starter',     steps: STARTER_STEPS },
  { profile: 'exploring',   steps: EXPLORING_STEPS },
  { profile: 'distracted',  steps: DISTRACTED_STEPS },
  { profile: 'independent', steps: INDEPENDENT_STEPS },
];

async function main(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Idempotency: skip if a Thévenin problem with this prompt already exists.
    const existing = await client.query<{ id: string }>(
      'SELECT id FROM problems WHERE topic = $1 AND problem_text = $2',
      ['thevenin', PROBLEM_TEXT],
    );
    if (existing.rows.length > 0) {
      console.log(`Thévenin problem already seeded (id=${existing.rows[0].id}). Skipping.`);
      await client.query('ROLLBACK');
      return;
    }

    // Parent problem — ground_truth_answer is required NUMERIC, so use 0 as a
    // placeholder. Single-shot grading is not used for this problem; per-step
    // grading is what matters. The instructor will fill in step ground truths.
    const problemResult = await client.query<{ id: string }>(
      `INSERT INTO problems (topic, difficulty, problem_text, ground_truth_answer, tolerance, error_taxonomy)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        'thevenin',
        'hard',
        PROBLEM_TEXT,
        0,
        0.01,
        ['sign_error', 'wrong_reference_node', 'short_circuit_misconception', 'supermesh_constraint_error'],
      ],
    );
    const problemId = problemResult.rows[0].id;

    let totalSteps = 0;
    for (const variant of VARIANTS) {
      const variantResult = await client.query<{ id: string }>(
        `INSERT INTO problem_variants (problem_id, learner_profile)
         VALUES ($1, $2)
         RETURNING id`,
        [problemId, variant.profile],
      );
      const variantId = variantResult.rows[0].id;

      for (let i = 0; i < variant.steps.length; i++) {
        const step = variant.steps[i];
        await client.query(
          `INSERT INTO problem_steps
             (variant_id, step_order, step_type, prompt_text, options,
              ground_truth_answer, tolerance, misconception_triggers)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            variantId,
            i + 1,
            step.step_type,
            step.prompt_text,
            step.options ? JSON.stringify(step.options) : null,
            step.ground_truth_answer ?? null,
            step.tolerance ?? (step.step_type === 'numeric' ? 0.01 : null),
            null,                                                       // misconception_triggers TBD in Sprint 3
          ],
        );
        totalSteps++;
      }
      console.log(`  • ${variant.profile.padEnd(12)} → ${variant.steps.length} steps`);
    }

    await client.query('COMMIT');
    console.log(`Done. Inserted 1 problem, ${VARIANTS.length} variants, ${totalSteps} steps.`);
    console.log('Note: numeric ground truths are NULL — fill them in via SQL when ready.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
