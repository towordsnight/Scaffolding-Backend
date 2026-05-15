import { buildSystemPrompt, buildUserPrompt, streamHint } from './ai-tutor';
import pool from '../db/client';
import { loadStudentProfile, loadProblemForHint } from '../db/queries/student-profile';
import type { StudentProfile } from '../types/schema';

jest.mock('../db/client', () => ({
  __esModule: true,
  default: { query: jest.fn() },
}));

jest.mock('../db/queries/student-profile', () => ({
  loadStudentProfile: jest.fn(),
  loadProblemForHint: jest.fn(),
}));

const mockStream = jest.fn();

jest.mock('@anthropic-ai/sdk', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      messages: { stream: mockStream },
    })),
  };
});

const mockPool = pool as jest.Mocked<typeof pool>;
const mockLoadProfile = loadStudentProfile as jest.MockedFunction<typeof loadStudentProfile>;
const mockLoadProblem = loadProblemForHint as jest.MockedFunction<typeof loadProblemForHint>;

function baseProfile(overrides: Partial<StudentProfile> = {}): StudentProfile {
  return {
    id: 'stu-1',
    display_name: 'Alex',
    adhd_flag: false,
    cold_start_done: true,
    consent_given_at: new Date(),
    course_level: 'intro',
    learner_profile: 'starter',
    sessions_completed: 3,
    stress_level: 1,
    focus_quality: 0.7,
    idle_streak_s: 0,
    consecutive_errors: 0,
    self_report_weight: 0.5,
    idle_threshold_s: 90,
    error_threshold: 3,
    hint_budget: 3,
    response_length_budget: 'medium',
    ...overrides,
  };
}

async function* fakeAnthropicStream(chunks: string[]): AsyncGenerator<unknown> {
  for (const text of chunks) {
    yield { type: 'content_block_delta', delta: { type: 'text_delta', text } };
  }
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.ANTHROPIC_API_KEY = 'test-key';
});

// ── buildSystemPrompt ─────────────────────────────────────────────────────────

describe('buildSystemPrompt', () => {
  const common = {
    problemText: 'Find the current through R2.',
    topic: 'kcl',
    errorTaxonomy: ['sign_error', 'node_direction_flip'],
    tier: 2,
    currentWork: 'I = V/R',
  };

  it('injects the response_length_budget sentence cap into the prompt', () => {
    const out = buildSystemPrompt({
      profile: baseProfile({ response_length_budget: 'short' }),
      hintDepth: 'socratic',
      ...common,
    });
    expect(out).toContain('1 sentence');
    expect(out).toContain('HARD constraint');
  });

  it('flips tone clause when stress_level=2', () => {
    const stressed = buildSystemPrompt({
      profile: baseProfile({ stress_level: 2 }),
      hintDepth: 'socratic',
      ...common,
    });
    expect(stressed).toContain('calm and encouraging');

    const neutral = buildSystemPrompt({
      profile: baseProfile({ stress_level: 1 }),
      hintDepth: 'socratic',
      ...common,
    });
    expect(neutral).toContain('neutral and direct');
  });

  it('changes guidance line based on hint depth', () => {
    const socratic = buildSystemPrompt({
      profile: baseProfile(),
      hintDepth: 'socratic',
      ...common,
    });
    expect(socratic).toContain('guiding question');

    const concrete = buildSystemPrompt({
      profile: baseProfile(),
      hintDepth: 'concrete',
      ...common,
    });
    expect(concrete).toContain('concrete next step');
  });

  it('never includes a ground-truth answer (caller does not supply one)', () => {
    const out = buildSystemPrompt({
      profile: baseProfile(),
      hintDepth: 'socratic',
      ...common,
    });
    expect(out).not.toMatch(/ground[_ ]truth/i);
    expect(out).toContain('Never reveal or restate the final numeric answer.');
  });
});

// ── buildUserPrompt ───────────────────────────────────────────────────────────

describe('buildUserPrompt', () => {
  it('mentions idle seconds when triggered by idle', () => {
    const out = buildUserPrompt({
      triggerType: 'idle',
      idleSeconds: 95,
      hintLevel: 2,
      hintDepth: 'concrete',
    });
    expect(out).toContain('95 seconds');
    expect(out).toContain('concrete hint at level 2');
  });

  it('uses different phrasing for error_streak trigger', () => {
    const out = buildUserPrompt({
      triggerType: 'error_streak',
      idleSeconds: 0,
      hintLevel: 1,
      hintDepth: 'socratic',
    });
    expect(out).toContain('wrong answers');
    expect(out).not.toContain('idle');
  });
});

// ── streamHint ────────────────────────────────────────────────────────────────

describe('streamHint', () => {
  function setupHappyPath(overrides: { profile?: Partial<StudentProfile>; hintDepth?: 'socratic' | 'concrete' } = {}) {
    mockLoadProfile.mockResolvedValue(baseProfile(overrides.profile));
    mockLoadProblem.mockResolvedValue({
      id: 'p1',
      topic: 'kvl',
      problem_text: 'Find V across R1.',
      error_taxonomy: ['sign_error'],
    });
    (mockPool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ tier: 2, hint_depth_preference: overrides.hintDepth ?? 'socratic' }] })
      .mockResolvedValueOnce({ rows: [{ current_problem_state: { answer_draft: '5V', steps: ['KVL loop A'] } }] });
    mockStream.mockReturnValue(fakeAnthropicStream(['Look ', 'at ', 'node A.']));
  }

  it('yields each text delta from the SDK stream and returns HintContext', async () => {
    setupHappyPath();
    const gen = streamHint({
      sessionId: 's1',
      studentId: 'stu-1',
      problemId: 'p1',
      hintLevel: 1,
      idleSeconds: 30,
      triggerType: 'manual',
    });

    const tokens: string[] = [];
    let final: IteratorResult<string, unknown> | undefined;
    while (true) {
      const next = await gen.next();
      if (next.done) {
        final = next;
        break;
      }
      tokens.push(next.value);
    }

    expect(tokens).toEqual(['Look ', 'at ', 'node A.']);
    expect(final?.value).toMatchObject({
      hintLevel: 1,
      hintDepth: 'socratic',
      responseBudget: 'medium',
    });
    expect(typeof (final?.value as { hintId: string }).hintId).toBe('string');
  });

  it('propagates hint_depth_preference=concrete from student_skills', async () => {
    setupHappyPath({ hintDepth: 'concrete' });
    const gen = streamHint({
      sessionId: 's1',
      studentId: 'stu-1',
      problemId: 'p1',
      hintLevel: 2,
      idleSeconds: 0,
      triggerType: 'manual',
    });
    // consume all
    let last: IteratorResult<string, unknown> | undefined;
    while (true) {
      const n = await gen.next();
      if (n.done) { last = n; break; }
    }
    expect((last?.value as { hintDepth: string }).hintDepth).toBe('concrete');

    const sdkCallArgs = mockStream.mock.calls[0][0] as { system: string };
    expect(sdkCallArgs.system).toContain('concrete next step');
  });

  it('uses ANTHROPIC_HINT_MODEL env var when set', async () => {
    process.env.ANTHROPIC_HINT_MODEL = 'claude-haiku-test-model';
    setupHappyPath();
    const gen = streamHint({
      sessionId: 's1',
      studentId: 'stu-1',
      problemId: 'p1',
      hintLevel: 1,
      idleSeconds: 0,
      triggerType: 'manual',
    });
    while (!(await gen.next()).done) { /* drain */ }

    expect(mockStream).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-haiku-test-model' }),
    );
    delete process.env.ANTHROPIC_HINT_MODEL;
  });

  it('throws when student_profile is missing', async () => {
    mockLoadProfile.mockResolvedValue(null);
    const gen = streamHint({
      sessionId: 's1',
      studentId: 'missing',
      problemId: 'p1',
      hintLevel: 1,
      idleSeconds: 0,
      triggerType: 'manual',
    });
    await expect(gen.next()).rejects.toThrow('student_profile not found');
  });
});
