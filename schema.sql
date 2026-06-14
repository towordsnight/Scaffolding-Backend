-- schema.sql — Single source of truth for all Postgres objects.
-- Deploy via src/db/migrate.ts. Never hand-edit the live database.

BEGIN;

-- ============================================================================
-- EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE topic           AS ENUM ('kvl', 'kcl', 'phasors', 'impedance', 'thevenin');
CREATE TYPE difficulty      AS ENUM ('easy', 'medium', 'hard');
CREATE TYPE hint_depth      AS ENUM ('socratic', 'concrete');
CREATE TYPE response_length AS ENUM ('short', 'brief', 'medium');
CREATE TYPE course_level    AS ENUM ('intro', 'intermediate', 'advanced');
CREATE TYPE learner_profile AS ENUM ('starter', 'exploring', 'distracted', 'independent');
CREATE TYPE step_type       AS ENUM ('planning', 'mcq', 'numeric', 'open');

-- ============================================================================
-- CORE PROFILE  (live, mutable)
-- ============================================================================

CREATE TABLE students (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email_hash          CHAR(64) NOT NULL UNIQUE,       -- SHA-256(lower(trim(email)))
    password_hash       TEXT NOT NULL,
    display_name        TEXT,
    adhd_flag           BOOLEAN NOT NULL DEFAULT FALSE,
    cold_start_done     BOOLEAN NOT NULL DEFAULT FALSE,
    consent_given_at    TIMESTAMPTZ,                     -- NULL until consent logged
    course_level        course_level NOT NULL DEFAULT 'intro',
    learner_profile     learner_profile,                 -- NULL until set during onboarding
    sessions_completed  INTEGER NOT NULL DEFAULT 0,
    -- Onboarding survey construct scores: raw 1–5 averages. NULL until declaration.
    attention_score       REAL CHECK (attention_score       BETWEEN 1 AND 5),
    autonomy_score        REAL CHECK (autonomy_score        BETWEEN 1 AND 5),
    competence_score      REAL CHECK (competence_score      BETWEEN 1 AND 5),
    self_regulation_score REAL CHECK (self_regulation_score BETWEEN 1 AND 5),
    self_efficacy_score   REAL CHECK (self_efficacy_score   BETWEEN 1 AND 5),
    -- Profile classification output. NULL until declaration.
    profile_confidence    REAL CHECK (profile_confidence BETWEEN 0 AND 1),
    classification_flag   TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE student_skills (
    student_id              UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    topic                   topic NOT NULL,
    tier                    INTEGER NOT NULL DEFAULT 1 CHECK (tier BETWEEN 0 AND 3),
    consecutive_up          INTEGER NOT NULL DEFAULT 0,
    consecutive_down        INTEGER NOT NULL DEFAULT 0,
    confidence              REAL NOT NULL DEFAULT 0.5,
    hint_depth_preference   hint_depth NOT NULL DEFAULT 'socratic',
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (student_id, topic)
);

CREATE TABLE adaptive_config (
    student_id              UUID PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
    idle_threshold_s        INTEGER NOT NULL DEFAULT 90,
    error_threshold         INTEGER NOT NULL DEFAULT 3,
    hint_budget             INTEGER NOT NULL DEFAULT 3,
    response_length_budget  response_length NOT NULL DEFAULT 'medium',
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- PROBLEM BANK  (static in MVP)
-- ============================================================================

CREATE TABLE problem_sets (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         TEXT NOT NULL,
    course_level course_level NOT NULL,
    topic        topic,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE problems (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    problem_set_id      UUID REFERENCES problem_sets(id) ON DELETE SET NULL,
    topic               topic NOT NULL,
    difficulty          difficulty NOT NULL,
    problem_text        TEXT NOT NULL,
    ground_truth_answer NUMERIC NOT NULL,
    tolerance           REAL NOT NULL DEFAULT 0.01,
    error_taxonomy      TEXT[] NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE cohort_priors (
    course_level    course_level NOT NULL,
    topic           topic NOT NULL,
    semester        TEXT NOT NULL,           -- e.g. '2026-spring'
    avg_tier        REAL NOT NULL,
    PRIMARY KEY (course_level, topic, semester)
);

-- ============================================================================
-- SESSION & STATE  (live, upserted)
-- ============================================================================

CREATE TABLE sessions (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id              UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    current_problem_id      UUID REFERENCES problems(id) ON DELETE SET NULL,
    current_step_id         UUID,  -- FK added after problem_steps is defined (see ALTER TABLE below)
    current_problem_state   JSONB NOT NULL DEFAULT '{}',
    hint_history            JSONB NOT NULL DEFAULT '[]',
    started_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at                TIMESTAMPTZ
);

CREATE TABLE cognitive_state (
    student_id          UUID PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
    stress_level        INTEGER NOT NULL DEFAULT 0 CHECK (stress_level BETWEEN 0 AND 2),
    focus_quality       REAL NOT NULL DEFAULT 0.5 CHECK (focus_quality >= 0 AND focus_quality <= 1),
    idle_streak_s       INTEGER NOT NULL DEFAULT 0,
    consecutive_errors  INTEGER NOT NULL DEFAULT 0,
    self_report_weight  REAL NOT NULL DEFAULT 0.8,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- AUDIT LOGS  (append-only — never UPDATE, never DELETE)
-- ============================================================================

CREATE TABLE problem_attempts (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id              UUID NOT NULL REFERENCES sessions(id) ON DELETE RESTRICT,
    problem_id              UUID NOT NULL REFERENCES problems(id) ON DELETE RESTRICT,
    student_id              UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
    submitted_answer        TEXT NOT NULL,
    outcome                 BOOLEAN NOT NULL,
    error_types             TEXT[] NOT NULL DEFAULT '{}',
    time_spent_s            INTEGER NOT NULL,
    skill_tier_at_attempt   INTEGER NOT NULL CHECK (skill_tier_at_attempt BETWEEN 0 AND 3),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE hint_events (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id              UUID NOT NULL REFERENCES sessions(id) ON DELETE RESTRICT,
    problem_id              UUID NOT NULL REFERENCES problems(id) ON DELETE RESTRICT,
    student_id              UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
    hint_level              INTEGER NOT NULL,
    hint_depth              hint_depth NOT NULL,
    absorbed                BOOLEAN NOT NULL DEFAULT FALSE,
    time_to_next_attempt_s  INTEGER,
    absorption_window_s     INTEGER,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE intervention_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      UUID NOT NULL REFERENCES sessions(id) ON DELETE RESTRICT,
    student_id      UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
    trigger_type    TEXT NOT NULL,
    trigger_value   JSONB NOT NULL,
    response_type   TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE state_snapshots (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id      UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
    session_id      UUID NOT NULL REFERENCES sessions(id) ON DELETE RESTRICT,
    stress_level    INTEGER NOT NULL CHECK (stress_level BETWEEN 0 AND 2),
    focus_quality   REAL NOT NULL CHECK (focus_quality >= 0 AND focus_quality <= 1),
    trigger         TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE checkin_responses (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id      UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
    session_id      UUID NOT NULL REFERENCES sessions(id) ON DELETE RESTRICT,
    question_key    TEXT NOT NULL,
    numeric_value   INTEGER NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE consent_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id      UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
    consent_type    TEXT NOT NULL DEFAULT 'ferpa',
    granted         BOOLEAN NOT NULL,
    ip_hash         CHAR(64),               -- SHA-256 of IP, nullable
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- MULTI-STEP PROBLEMS  (per-profile scaffolded variants)
-- ============================================================================

CREATE TABLE problem_variants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    problem_id      UUID NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    learner_profile learner_profile NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (problem_id, learner_profile)
);

CREATE TABLE problem_steps (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    variant_id              UUID NOT NULL REFERENCES problem_variants(id) ON DELETE CASCADE,
    step_order              INTEGER NOT NULL,
    step_type               step_type NOT NULL,
    prompt_text             TEXT NOT NULL,
    options                 JSONB,           -- mcq only: [{key, text, is_correct}]
    ground_truth_answer     NUMERIC,         -- numeric only; NULL = ungraded placeholder
    tolerance               REAL DEFAULT 0.01,
    misconception_triggers  JSONB,           -- stored, evaluated in Sprint 3
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (variant_id, step_order)
);

-- Add the forward-reference FK from sessions now that problem_steps exists.
ALTER TABLE sessions
    ADD CONSTRAINT sessions_step_id_fkey
    FOREIGN KEY (current_step_id) REFERENCES problem_steps(id) ON DELETE SET NULL;

CREATE TABLE problem_step_attempts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      UUID NOT NULL REFERENCES sessions(id) ON DELETE RESTRICT,
    student_id      UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
    step_id         UUID NOT NULL REFERENCES problem_steps(id) ON DELETE RESTRICT,
    submitted_value TEXT NOT NULL,
    correct         BOOLEAN,                 -- NULL when step is ungraded (no ground truth yet)
    time_spent_s    INTEGER NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- APPEND-ONLY RULES  (block UPDATE and DELETE on audit tables)
-- ============================================================================

CREATE RULE no_update_problem_attempts AS ON UPDATE TO problem_attempts DO INSTEAD NOTHING;
CREATE RULE no_delete_problem_attempts AS ON DELETE TO problem_attempts DO INSTEAD NOTHING;

CREATE RULE no_update_hint_events AS ON UPDATE TO hint_events DO INSTEAD NOTHING;
CREATE RULE no_delete_hint_events AS ON DELETE TO hint_events DO INSTEAD NOTHING;

CREATE RULE no_update_intervention_events AS ON UPDATE TO intervention_events DO INSTEAD NOTHING;
CREATE RULE no_delete_intervention_events AS ON DELETE TO intervention_events DO INSTEAD NOTHING;

CREATE RULE no_update_state_snapshots AS ON UPDATE TO state_snapshots DO INSTEAD NOTHING;
CREATE RULE no_delete_state_snapshots AS ON DELETE TO state_snapshots DO INSTEAD NOTHING;

CREATE RULE no_update_checkin_responses AS ON UPDATE TO checkin_responses DO INSTEAD NOTHING;
CREATE RULE no_delete_checkin_responses AS ON DELETE TO checkin_responses DO INSTEAD NOTHING;

CREATE RULE no_update_consent_log AS ON UPDATE TO consent_log DO INSTEAD NOTHING;
CREATE RULE no_delete_consent_log AS ON DELETE TO consent_log DO INSTEAD NOTHING;

CREATE RULE no_update_problem_step_attempts AS ON UPDATE TO problem_step_attempts DO INSTEAD NOTHING;
CREATE RULE no_delete_problem_step_attempts AS ON DELETE TO problem_step_attempts DO INSTEAD NOTHING;

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX idx_sessions_student_id       ON sessions(student_id);
CREATE INDEX idx_sessions_last_seen_at     ON sessions(last_seen_at);
CREATE INDEX idx_problem_attempts_student   ON problem_attempts(student_id);
CREATE INDEX idx_problem_attempts_session   ON problem_attempts(session_id);
CREATE INDEX idx_hint_events_student        ON hint_events(student_id);
CREATE INDEX idx_hint_events_session        ON hint_events(session_id);
CREATE INDEX idx_problems_topic_difficulty  ON problems(topic, difficulty);
CREATE INDEX idx_problems_problem_set       ON problems(problem_set_id);
CREATE INDEX idx_problem_variants_profile   ON problem_variants(problem_id, learner_profile);
CREATE INDEX idx_problem_steps_variant      ON problem_steps(variant_id, step_order);
CREATE INDEX idx_problem_step_attempts_student ON problem_step_attempts(student_id);
CREATE INDEX idx_problem_step_attempts_session ON problem_step_attempts(session_id);
CREATE INDEX idx_problem_step_attempts_step    ON problem_step_attempts(step_id);

-- ============================================================================
-- VIEW: student_profile
-- Joins students + cognitive_state + adaptive_config for fast profile reads.
-- Target: < 50ms. Cache result in Redis for session duration.
-- ============================================================================

CREATE VIEW student_profile AS
SELECT
    s.id,
    s.display_name,
    s.adhd_flag,
    s.cold_start_done,
    s.consent_given_at,
    s.course_level,
    s.learner_profile,
    s.sessions_completed,
    cs.stress_level,
    cs.focus_quality,
    cs.idle_streak_s,
    cs.consecutive_errors,
    cs.self_report_weight,
    ac.idle_threshold_s,
    ac.error_threshold,
    ac.hint_budget,
    ac.response_length_budget
FROM students s
LEFT JOIN cognitive_state cs ON cs.student_id = s.id
LEFT JOIN adaptive_config ac ON ac.student_id = s.id;

COMMIT;
