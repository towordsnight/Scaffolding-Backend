import request from 'supertest';
import pool from '../db/client';
import app from '../app';

// Wipe all data between tests.
// TRUNCATE bypasses the append-only RULES (which only intercept DELETE).
// CASCADE drops dependent rows in audit + child tables automatically.
export async function truncateAll(): Promise<void> {
  await pool.query(`
    TRUNCATE students, problems, cohort_priors, problem_sets
    RESTART IDENTITY CASCADE
  `);
}

// Seed a minimal problem row and return its id.
export async function seedProblem(overrides: {
  topic?: string;
  difficulty?: string;
  problem_text?: string;
  ground_truth_answer?: number;
  tolerance?: number;
} = {}): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO problems (topic, difficulty, problem_text, ground_truth_answer, tolerance)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [
      overrides.topic ?? 'kvl',
      overrides.difficulty ?? 'easy',
      overrides.problem_text ?? 'Test problem: find V1.',
      overrides.ground_truth_answer ?? 10,
      overrides.tolerance ?? 0.01,
    ],
  );
  return result.rows[0].id;
}

// Register a student and return a supertest agent that carries the session cookie.
// The agent behaves like a browser — subsequent requests automatically include the cookie.
export async function registerAndLogin(
  email = 'student@uw.edu',
  password = 'password123',
): Promise<ReturnType<typeof request.agent>> {
  const agent = request.agent(app);
  await agent
    .post('/api/auth/register')
    .send({ email, password, consent: true })
    .expect(201);
  return agent;
}

export { pool };
