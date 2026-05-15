import 'dotenv/config';
import { spawn, type ChildProcess } from 'child_process';
import { once } from 'events';
import { setTimeout as delay } from 'timers/promises';
import { Pool } from 'pg';

const BASE_URL = `http://127.0.0.1:${process.env.PORT ?? '3000'}`;
const PREPARE = process.argv.includes('--prepare');
const NPM_BIN = process.platform === 'win32' ? 'npm.cmd' : 'npm';

interface ReadinessReport {
  blockers: string[];
  warnings: string[];
}

function requireEnv(names: string[]): void {
  const missing = names.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }
}

function section(title: string): void {
  console.log(`\n${'#'.repeat(72)}`);
  console.log(`# ${title}`);
  console.log('#'.repeat(72));
}

function createPool(): Pool {
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 4,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 2_000,
  });
}

async function runNpmScript(
  script: string,
  title: string,
  args: string[] = [],
  extraEnv: NodeJS.ProcessEnv = {},
): Promise<void> {
  section(title);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(NPM_BIN, ['run', script, ...args], {
      cwd: process.cwd(),
      env: { ...process.env, ...extraEnv },
      stdio: 'inherit',
    });

    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`npm run ${script} failed with ${signal ? `signal ${signal}` : `exit code ${code}`}`));
    });
  });
}

async function inspectReadiness(): Promise<ReadinessReport> {
  const pool = createPool();
  const blockers: string[] = [];
  const warnings: string[] = [];

  const requiredTables = [
    'students',
    'student_skills',
    'adaptive_config',
    'problems',
    'sessions',
    'cognitive_state',
    'problem_variants',
    'problem_steps',
    'problem_step_attempts',
  ];

  try {
    for (const table of requiredTables) {
      const result = await pool.query<{ exists: boolean }>(
        'SELECT to_regclass($1) IS NOT NULL AS exists',
        [`public.${table}`],
      );
      if (!result.rows[0]?.exists) {
        blockers.push(`Missing required table public.${table}`);
      }
    }

    if (blockers.length === 0) {
      const coverage = await pool.query<{ topic: string; difficulty: string; count: string }>(
        `SELECT topic::text AS topic, difficulty::text AS difficulty, count(*)::text AS count
           FROM problems
          WHERE topic <> 'thevenin'
          GROUP BY topic, difficulty`,
      );
      const counts = new Map(
        coverage.rows.map((row) => [`${row.topic}/${row.difficulty}`, Number(row.count)]),
      );
      const requiredProblemPairs = [
        'kvl/easy',
        'kvl/medium',
        'kvl/hard',
        'kcl/easy',
        'kcl/medium',
        'kcl/hard',
        'phasors/easy',
        'phasors/medium',
        'phasors/hard',
        'impedance/easy',
        'impedance/medium',
        'impedance/hard',
      ];

      for (const pair of requiredProblemPairs) {
        if ((counts.get(pair) ?? 0) < 1) {
          blockers.push(`Problem bank is missing ${pair}`);
        }
      }

      const theveninRows = await pool.query<{ count: string }>(
        `SELECT count(*)::text AS count
           FROM problems p
           JOIN problem_variants v ON v.problem_id = p.id
          WHERE p.topic = 'thevenin'`,
      );
      if (Number(theveninRows.rows[0]?.count ?? 0) === 0) {
        warnings.push('No seeded Thevenin scaffold detected. Live smoke will skip scaffold coverage.');
      }

      const cohortPriors = await pool.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM cohort_priors',
      );
      if (Number(cohortPriors.rows[0]?.count ?? 0) === 0) {
        warnings.push('cohort_priors is empty. The current gate can still run, but local prep usually seeds it.');
      }
    }
  } finally {
    await pool.end();
  }

  return { blockers, warnings };
}

async function waitForHealth(server: ChildProcess): Promise<void> {
  let exitState: { code: number | null; signal: NodeJS.Signals | null } | null = null;
  server.once('exit', (code, signal) => {
    exitState = { code, signal };
  });

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (exitState) {
      throw new Error(
        `Development server exited before becoming healthy (${exitState.signal ? `signal ${exitState.signal}` : `code ${exitState.code}`})`,
      );
    }

    try {
      const res = await fetch(`${BASE_URL}/health`);
      if (res.ok) {
        const body = (await res.json()) as { status?: string };
        if (body.status === 'ok') return;
      }
    } catch {
      // Retry until deadline.
    }

    await delay(1000);
  }

  throw new Error(`Timed out waiting for ${BASE_URL}/health`);
}

async function startServer(): Promise<ChildProcess> {
  section('Gate 3 — start the real app');
  const server = spawn(NPM_BIN, ['run', 'start'], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });

  try {
    await waitForHealth(server);
    console.log(`Server is healthy at ${BASE_URL}`);
    return server;
  } catch (err) {
    await stopServer(server);
    throw err;
  }
}

async function stopServer(server: ChildProcess): Promise<void> {
  if (server.killed || server.exitCode !== null) return;

  server.kill('SIGTERM');
  const exitPromise = once(server, 'exit').then(() => undefined).catch(() => undefined);
  const timeout = delay(5_000).then(() => undefined);
  await Promise.race([exitPromise, timeout]);

  if (server.exitCode === null) {
    server.kill('SIGKILL');
    await once(server, 'exit').catch(() => undefined);
  }
}

async function maybePrepareEnvironment(): Promise<void> {
  if (!PREPARE) return;

  await runNpmScript('migrate', 'Prep — migrate');
  await runNpmScript('import-problems', 'Prep — seed core problem bank');
  await runNpmScript('import-thevenin', 'Prep — seed Thevenin scaffold');
  await runNpmScript('seed-cohort-priors', 'Prep — seed cohort priors');
}

function printReadiness(report: ReadinessReport): void {
  if (report.warnings.length > 0) {
    section('Environment warnings');
    for (const warning of report.warnings) {
      console.log(`- ${warning}`);
    }
  }

  if (report.blockers.length > 0) {
    section('Environment blockers');
    for (const blocker of report.blockers) {
      console.log(`- ${blocker}`);
    }

    console.log('\nTo prepare a fresh or incomplete environment, run:');
    console.log('- `npm run test:prepush:prepare`');
    console.log('- or the individual prep commands from the balanced plan');
    console.log('\nNote: `npm run migrate` bootstraps fresh databases only; it does not patch an older deployed schema in place.');
  }
}

async function main(): Promise<void> {
  requireEnv(['DATABASE_URL', 'REDIS_URL', 'ANTHROPIC_API_KEY', 'JWT_SECRET']);

  await maybePrepareEnvironment();

  const readiness = await inspectReadiness();
  printReadiness(readiness);
  if (readiness.blockers.length > 0) {
    process.exit(1);
  }

  await runNpmScript('build', 'Gate 1 — TypeScript build');
  await runNpmScript('test', 'Gate 2 — Jest suite');

  const server = await startServer();
  try {
    await runNpmScript('test:smoke', 'Gate 4 — live smoke flow', [], {
      TEST_BASE_URL: BASE_URL,
    });
    await runNpmScript('test:adaptive', 'Gate 5 — adaptive black-box verification', [], {
      TEST_BASE_URL: BASE_URL,
    });
  } finally {
    await stopServer(server);
  }

  section('Balanced pre-push gate passed');
  console.log('All required build, test, smoke, and adaptive checks passed in the same environment.');
}

main().catch((err) => {
  console.error('\nBalanced pre-push gate failed.');
  console.error(err);
  process.exit(1);
});
