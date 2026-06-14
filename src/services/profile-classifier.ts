import type { LearnerProfile } from '../types/schema';

type Level = 'low' | 'medium' | 'high';

export interface ClassifierInput {
  attentionDifficulty: number;
  autonomy: number;
  competence: number;
  selfRegulation: number;
  selfEfficacy: number;
}

export interface ClassifierOutput {
  attentionDifficulty: number;
  autonomy: number;
  competence: number;
  selfRegulation: number;
  selfEfficacy: number;
  profileScores: { profile1: number; profile2: number; profile3: number; profile4: number };
  assignedProfile: LearnerProfile;
  confidence: number;
  flag: 'ambiguous' | null;
}

// Spec §3 level boundaries
export function toLevel(score: number): Level {
  if (score >= 3.51) return 'high';
  if (score >= 2.76) return 'medium';
  return 'low';
}

type ConstructKey = 'selfEfficacy' | 'selfRegulation' | 'attentionDifficulty' | 'autonomy' | 'competence';
type ProfileRules = Record<ConstructKey, Level[]>;

// Spec §4 profile rules — index 0→starter, 1→exploring, 2→distracted, 3→independent
const PROFILES: ProfileRules[] = [
  { selfEfficacy: ['low'],           selfRegulation: ['low'],           attentionDifficulty: ['high'],         autonomy: ['low'],          competence: ['low']           },
  { selfEfficacy: ['low','medium'],  selfRegulation: ['low'],           attentionDifficulty: ['low','medium'], autonomy: ['medium','high'], competence: ['low','medium']  },
  { selfEfficacy: ['medium','high'], selfRegulation: ['medium','high'], attentionDifficulty: ['high'],         autonomy: ['medium','high'], competence: ['medium']        },
  { selfEfficacy: ['high'],          selfRegulation: ['high'],          attentionDifficulty: ['low'],          autonomy: ['high'],          competence: ['medium','high'] },
];

const PROFILE_NAMES: LearnerProfile[] = ['starter', 'exploring', 'distracted', 'independent'];

// Spec §8 tie-break priority order
const TIE_BREAK_ORDER: ConstructKey[] = [
  'selfEfficacy', 'selfRegulation', 'attentionDifficulty', 'autonomy', 'competence',
];

export function classifyProfile(input: ClassifierInput): ClassifierOutput {
  const levels: Record<ConstructKey, Level> = {
    selfEfficacy:        toLevel(input.selfEfficacy),
    selfRegulation:      toLevel(input.selfRegulation),
    attentionDifficulty: toLevel(input.attentionDifficulty),
    autonomy:            toLevel(input.autonomy),
    competence:          toLevel(input.competence),
  };

  // Spec §5 match scores
  const scores = PROFILES.map(rules =>
    TIE_BREAK_ORDER.reduce((acc, key) => acc + (rules[key].includes(levels[key]) ? 1 : 0), 0),
  );

  const maxScore = Math.max(...scores);

  // Spec §8 tie-breaking: narrow candidates by priority construct until one remains
  let candidates = scores.map((s, i) => i).filter(i => scores[i] === maxScore);
  for (const key of TIE_BREAK_ORDER) {
    if (candidates.length === 1) break;
    const matching = candidates.filter(i => PROFILES[i][key].includes(levels[key]));
    if (matching.length > 0 && matching.length < candidates.length) {
      candidates = matching;
    }
  }

  return {
    attentionDifficulty: input.attentionDifficulty,
    autonomy:            input.autonomy,
    competence:          input.competence,
    selfRegulation:      input.selfRegulation,
    selfEfficacy:        input.selfEfficacy,
    profileScores: { profile1: scores[0], profile2: scores[1], profile3: scores[2], profile4: scores[3] },
    assignedProfile: PROFILE_NAMES[candidates[0]],
    confidence:      maxScore / 5,
    flag:            maxScore < 3 ? 'ambiguous' : null,
  };
}
