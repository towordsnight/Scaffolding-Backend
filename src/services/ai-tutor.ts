import { randomUUID } from 'crypto';
import Anthropic from '@anthropic-ai/sdk';

import pool from '../db/client';
import { loadStudentProfile, loadProblemForHint } from '../db/queries/student-profile';
import type { HintDepth, ResponseLength, StudentProfile } from '../types/schema';

export type HintTrigger = 'idle' | 'error_streak' | 'hint_budget_exhausted' | 'manual';

export interface HintRequest {
  sessionId: string;
  studentId: string;
  problemId: string;
  hintLevel: number;
  idleSeconds: number;
  triggerType: HintTrigger;
}

export interface HintContext {
  hintId: string;
  hintLevel: number;
  hintDepth: HintDepth;
  responseBudget: ResponseLength;
}

const SENTENCE_CAP: Record<ResponseLength, string> = {
  short:  '1 sentence',
  brief:  '2 sentences in a chunked exchange',
  medium: '2 to 3 sentences ending with a follow-up question',
};

const MAX_TOKENS: Record<ResponseLength, number> = {
  short:  80,
  brief:  160,
  medium: 280,
};

const TRIGGER_PHRASE: Record<HintTrigger, string> = {
  idle:                   'has been idle',
  error_streak:           'has just submitted several wrong answers in a row',
  hint_budget_exhausted:  'has exhausted their hint budget for this problem',
  manual:                 'asked for a hint',
};

let anthropicClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (anthropicClient) return anthropicClient;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY env var is required');
  anthropicClient = new Anthropic({ apiKey });
  return anthropicClient;
}

export function buildSystemPrompt(args: {
  profile: StudentProfile;
  problemText: string;
  topic: string;
  errorTaxonomy: string[];
  tier: number;
  hintDepth: HintDepth;
  currentWork: string;
}): string {
  const { profile, problemText, topic, errorTaxonomy, tier, hintDepth, currentWork } = args;
  const cap = SENTENCE_CAP[profile.response_length_budget];
  const tone =
    profile.stress_level === 2
      ? 'Tone: calm and encouraging. The student is stressed.'
      : 'Tone: neutral and direct.';

  return [
    'You are a circuit analysis tutor for an undergraduate ECE student.',
    `Problem: ${problemText}`,
    `Topic: ${topic}`,
    `Student skill tier for this topic: ${tier} (0 = novice, 3 = advanced).`,
    `Hint depth: ${hintDepth}.`,
    `Response budget: ${cap} maximum. This is a HARD constraint.`,
    `Error taxonomy for this problem: ${errorTaxonomy.join(', ') || '(none specified)'}.`,
    `Student's current work: ${currentWork || '(none submitted yet)'}.`,
    tone,
    'Rules:',
    '- Never reveal or restate the final numeric answer.',
    '- Never exceed the response budget.',
    '- If giving feedback on an error, name the exact error type from the taxonomy.',
    hintDepth === 'socratic'
      ? '- Lead the student to the next step with a guiding question, not a direct instruction.'
      : '- Give one concrete next step the student can take.',
  ].join('\n');
}

export function buildUserPrompt(args: {
  triggerType: HintTrigger;
  idleSeconds: number;
  hintLevel: number;
  hintDepth: HintDepth;
}): string {
  const { triggerType, idleSeconds, hintLevel, hintDepth } = args;
  const triggerLine =
    triggerType === 'idle'
      ? `The student has been idle for ${idleSeconds} seconds.`
      : `The student ${TRIGGER_PHRASE[triggerType]}.`;
  return `${triggerLine} Deliver a ${hintDepth} hint at level ${hintLevel}.`;
}

export async function* streamHint(
  req: HintRequest,
): AsyncGenerator<string, HintContext, void> {
  const profile = await loadStudentProfile(req.studentId);
  if (!profile) throw new Error(`student_profile not found for ${req.studentId}`);

  const problem = await loadProblemForHint(req.problemId);
  if (!problem) throw new Error(`problem not found for ${req.problemId}`);

  const skillRow = await pool.query<{ tier: number; hint_depth_preference: HintDepth }>(
    'SELECT tier, hint_depth_preference FROM student_skills WHERE student_id=$1 AND topic=$2',
    [req.studentId, problem.topic],
  );
  const tier = skillRow.rows[0]?.tier ?? 1;
  const hintDepth: HintDepth = skillRow.rows[0]?.hint_depth_preference ?? 'socratic';

  const sessionRow = await pool.query<{ current_problem_state: { answer_draft: string | null; steps: string[] } | null }>(
    'SELECT current_problem_state FROM sessions WHERE id=$1',
    [req.sessionId],
  );
  const state = sessionRow.rows[0]?.current_problem_state;
  const currentWork = state
    ? [state.answer_draft, ...(state.steps ?? [])].filter(Boolean).join(' | ')
    : '';

  const system = buildSystemPrompt({
    profile,
    problemText: problem.problem_text,
    topic: problem.topic,
    errorTaxonomy: problem.error_taxonomy,
    tier,
    hintDepth,
    currentWork,
  });
  const userPrompt = buildUserPrompt({
    triggerType: req.triggerType,
    idleSeconds: req.idleSeconds,
    hintLevel: req.hintLevel,
    hintDepth,
  });

  const model = process.env.ANTHROPIC_HINT_MODEL ?? 'claude-haiku-4-5';
  const client = getClient();
  const stream = client.messages.stream({
    model,
    max_tokens: MAX_TOKENS[profile.response_length_budget],
    system,
    messages: [{ role: 'user', content: userPrompt }],
  });

  for await (const event of stream) {
    if (
      event.type === 'content_block_delta' &&
      event.delta.type === 'text_delta'
    ) {
      yield event.delta.text;
    }
  }

  return {
    hintId: randomUUID(),
    hintLevel: req.hintLevel,
    hintDepth,
    responseBudget: profile.response_length_budget,
  };
}
