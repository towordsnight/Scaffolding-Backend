// TypeScript types mirroring every Postgres table and enum in schema.sql.
// Keep in sync with schema.sql — this is NOT auto-generated.

// ============================================================================
// ENUMS
// ============================================================================

export type Topic = 'kvl' | 'kcl' | 'phasors' | 'impedance';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type HintDepth = 'socratic' | 'concrete';
export type ResponseLength = 'short' | 'brief' | 'medium';
export type CourseLevel = 'intro' | 'intermediate' | 'advanced';

// ============================================================================
// CORE PROFILE
// ============================================================================

export interface Student {
  id: string;
  email_hash: string;          // SHA-256(lower(trim(email))) — 64 hex chars
  password_hash: string;
  display_name: string | null;
  adhd_flag: boolean;
  cold_start_done: boolean;
  consent_given_at: Date | null;
  course_level: CourseLevel;
  sessions_completed: number;
  created_at: Date;
  updated_at: Date;
}

export interface StudentSkill {
  student_id: string;
  topic: Topic;
  tier: number;                // 0–3
  consecutive_up: number;
  consecutive_down: number;
  confidence: number;          // 0.0–1.0
  hint_depth_preference: HintDepth;
  updated_at: Date;
}

export interface AdaptiveConfig {
  student_id: string;
  idle_threshold_s: number;    // default 90
  error_threshold: number;     // default 3
  hint_budget: number;         // default 3
  response_length_budget: ResponseLength;
  updated_at: Date;
}

// ============================================================================
// PROBLEM BANK
// ============================================================================

export interface Problem {
  id: string;
  topic: Topic;
  difficulty: Difficulty;
  problem_text: string;
  ground_truth_answer: number;
  tolerance: number;           // default 0.01 (±1%)
  error_taxonomy: string[];
  created_at: Date;
}

export interface CohortPrior {
  course_level: CourseLevel;
  topic: Topic;
  semester: string;            // e.g. '2026-spring'
  avg_tier: number;
}

// ============================================================================
// SESSION & STATE
// ============================================================================

export interface ProblemState {
  answer_draft: string | null;
  steps: string[];
  last_modified: string;       // ISO timestamp
}

export interface HintHistoryEntry {
  hint_id: string;
  hint_level: number;
  shown_at: string;            // ISO timestamp
  absorbed: boolean;
}

export interface Session {
  id: string;
  student_id: string;
  current_problem_id: string | null;
  current_problem_state: ProblemState;
  hint_history: HintHistoryEntry[];
  started_at: Date;
  last_seen_at: Date;
  ended_at: Date | null;
}

export interface CognitiveState {
  student_id: string;
  stress_level: 0 | 1 | 2;
  focus_quality: number;       // 0.0–1.0
  idle_streak_s: number;
  consecutive_errors: number;
  self_report_weight: number;  // default 0.8
  updated_at: Date;
}

// ============================================================================
// AUDIT LOGS (append-only)
// ============================================================================

export interface ProblemAttempt {
  id: string;
  session_id: string;
  problem_id: string;
  student_id: string;
  submitted_answer: string;
  outcome: boolean;
  error_types: string[];
  time_spent_s: number;
  skill_tier_at_attempt: number;
  created_at: Date;
}

export interface HintEvent {
  id: string;
  session_id: string;
  problem_id: string;
  student_id: string;
  hint_level: number;
  hint_depth: HintDepth;
  absorbed: boolean;
  time_to_next_attempt_s: number | null;
  absorption_window_s: number | null;
  created_at: Date;
}

export interface InterventionEvent {
  id: string;
  session_id: string;
  student_id: string;
  trigger_type: string;
  trigger_value: Record<string, unknown>;
  response_type: string;
  created_at: Date;
}

export interface StateSnapshot {
  id: string;
  student_id: string;
  session_id: string;
  stress_level: 0 | 1 | 2;
  focus_quality: number;
  trigger: string;
  created_at: Date;
}

export interface CheckinResponse {
  id: string;
  student_id: string;
  session_id: string;
  question_key: string;
  numeric_value: number;
  created_at: Date;
}

export interface ConsentLog {
  id: string;
  student_id: string;
  consent_type: string;
  granted: boolean;
  ip_hash: string | null;
  created_at: Date;
}

// ============================================================================
// VIEW: student_profile
// ============================================================================

export interface StudentProfile {
  id: string;
  display_name: string | null;
  adhd_flag: boolean;
  cold_start_done: boolean;
  consent_given_at: Date | null;
  course_level: CourseLevel;
  sessions_completed: number;
  // cognitive_state fields
  stress_level: 0 | 1 | 2;
  focus_quality: number;
  idle_streak_s: number;
  consecutive_errors: number;
  self_report_weight: number;
  // adaptive_config fields
  idle_threshold_s: number;
  error_threshold: number;
  hint_budget: number;
  response_length_budget: ResponseLength;
}

// ============================================================================
// REDIS session shape
// ============================================================================

export interface RedisSession {
  current_problem_id: string | null;
  current_problem_state: ProblemState;
  hint_history: HintHistoryEntry[];
  last_input_at: string;       // ISO timestamp
  last_seen_at: string;        // ISO timestamp
  idle_streak_seconds: number;
  consecutive_errors: number;
  hints_used_this_problem: number;
}
