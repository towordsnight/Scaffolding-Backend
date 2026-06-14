# ECE Adaptive Scaffold — CLAUDE.md
# Read at the start of every Claude Code session.
# Keep this file concise. Link to external files for detail.
# Last updated: June 11, 2026

================================================================================
PROJECT OVERVIEW
================================================================================

Adaptive AI tutoring system for ECE students (KVL, KCL, phasors, impedance).
Modulates hint depth, pacing, and tone based on real-time cognitive/emotional state.
Fixed instructor-authored problem DB. Students only (no instructor dashboard in MVP).

Build: Solo. Start: Apr 14 2026. Launch: Jun 1 2026.
Stack: Node.js (TypeScript) + Supabase (Postgres + Redis) + Vercel/Railway
AI:    claude-haiku-4-5 (hints), claude-sonnet-4-6 (targeted feedback)
Auth:  Email + JWT (httpOnly cookie). No SSO in MVP.


================================================================================
CURRENT SPRINT
================================================================================

SPRINT 3 — AI Tutor (May 12 – May 25)
Goal: Students receive streamed AI hints and targeted feedback. Adaptive engine
      triggers route to the AI tutor. Response budget and tone enforced by prompt.

Week 1 (May 12 – May 18):
  [ ] src/services/ai-tutor.ts — Anthropic SDK wrapper, prompt assembly, streaming
  [ ] src/api/hints/handler.ts + router.ts — POST /api/hints
  [ ] Hint delivery: reads student profile + Redis state, streams haiku response,
      logs to hint_events

Week 2 (May 19 – May 25):
  [ ] src/api/feedback/handler.ts + router.ts — POST /api/feedback
  [ ] Targeted feedback: reads problem_attempts, names exact error_taxonomy type,
      streams sonnet response
  [ ] Wire adaptive-engine intervention trigger → hint delivery (idle + error streak)
  [ ] Hint absorption tracking: update hint_events.absorbed on next attempt

Exit criteria:
  POST /api/hints returns a streamed hint within response_length_budget.
  POST /api/feedback names an error from error_taxonomy[]; never reveals ground truth.
  Idle intervention on heartbeat → hint auto-delivered to client.
  All new endpoints have tests (streaming mocked).

Full design: docs/sprint3-backend-design.md (includes prompt template + adaptation logic)


================================================================================
FILE STRUCTURE
================================================================================

/CLAUDE.md                  ← this file
/schema.sql                 ← full Postgres schema (source of truth, never edit by hand)
/src/
  db/
    migrate.ts              ← deploys schema.sql to Supabase
    queries/                ← typed query functions per table
  api/
    auth/                   ← register, login, logout
    events/                 ← POST /api/events (client event ingestion)
    onboarding/             ← self-declaration + diagnostic flow
    problems/               ← problem fetch + answer submission
    sessions/               ← heartbeat, re-entry, state restore
    hints/                  ← AI hint delivery (Sprint 3)
    feedback/               ← AI targeted feedback (Sprint 3)
  services/
    adaptive-engine.ts      ← threshold evaluation + intervention routing
    ai-tutor.ts             ← Anthropic API calls + prompt assembly
    skill-updater.ts        ← tier update logic + hysteresis
    cognitive-state.ts      ← stress/focus blending formula
  redis/
    session-store.ts        ← Redis key patterns + helpers
    keys.ts                 ← key name constants
  types/
    schema.ts               ← TypeScript types matching Postgres enums/tables
scripts/
  import-problems.ts        ← one-time problem DB import + tagging
  seed-cohort-priors.ts     ← seed cohort_priors before launch


================================================================================
DATABASE
================================================================================

Source of truth: schema.sql in project root.
Never hand-edit the DB — always migrate via code.

Tables by group:

  CORE PROFILE (live, mutable)
    students          — identity, consent, adhd_flag, cold_start_done
    student_skills    — tier per topic (0–3), hysteresis counters, confidence
    adaptive_config   — computed thresholds (idle, error, hint budget, response length)

  PROBLEM BANK (static in MVP)
    problems          — topic, difficulty, error_taxonomy[], ground_truth_answer
    cohort_priors     — avg_tier per course_level + topic per semester

  SESSION & STATE (live, upserted)
    sessions          — current_problem_state (JSONB), hint_history, last_seen_at
    cognitive_state   — stress_level, focus_quality, idle_streak, consecutive_errors

  AUDIT LOGS (append-only — never UPDATE, never DELETE)
    problem_attempts      — outcome, error_types[], time, skill_tier_at_attempt
    hint_events           — absorbed (bool), time_to_next_attempt, absorption window
    intervention_events   — trigger_type, trigger_value (JSONB), response_type
    state_snapshots       — stress + focus snapshot at each state change
    checkin_responses     — self-report values over time
    consent_log           — FERPA record, timestamped before onboarding


================================================================================
REDIS
================================================================================

Key pattern:  session:{session_id}
TTL:          24 hours, extended on every heartbeat (every 30s)
On cache miss: reload from sessions table in Postgres (never fail silently)

Fields per key:
  current_problem_id        (string | null)
  current_problem_state     (JSON: { answer_draft, steps[], last_modified })
  hint_history              (JSON array: [{ hint_id, hint_level, shown_at, absorbed }])
  last_input_at             (ISO timestamp)
  last_seen_at              (ISO timestamp)
  idle_streak_seconds       (integer)
  consecutive_errors        (integer)
  hints_used_this_problem   (integer)


================================================================================
NON-NEGOTIABLE CONSTRAINTS
================================================================================

1. NEVER hard-delete from log tables.
   Tables: problem_attempts, hint_events, intervention_events,
           state_snapshots, checkin_responses, consent_log
   These are the IRB audit trail. Soft-delete only. Confirm before any purge job.

2. Consent MUST be logged before onboarding proceeds.
   Check: students.consent_given_at IS NOT NULL before writing self-declaration.
   If null → redirect to privacy notice. No exceptions.

3. Email stored as SHA-256 hash only.
   Hash: SHA-256(lower(trim(email))). Raw email never stored anywhere.
   Used only for login lookup.

4. Answer comparison is numeric + tolerance, not string match.
   Formula: abs(float(submitted) - float(ground_truth)) / float(ground_truth) <= tolerance
   Default tolerance: 0.01 (±1%). Enforce in application layer, not SQL.

5. All timestamps in UTC (timestamptz). Never store local time.

6. Thresholds live in adaptive_config, never hardcoded.
   Base values: idle=90s, errors=3, hints=3.
   ADHD/stressed multipliers applied at config write time, not at read time.

7. Profile reads must be < 50ms.
   Use the student_profile view (joins students + cognitive_state + adaptive_config).
   Cache in Redis for the duration of the session.

8. Skeleton UI must appear in < 300ms before any AI response.
   AI calls are always streamed. Never wait for full response before rendering.

9. Before writing ANY code, follow the Planning-First Rule.
   Full rule: docs/working-style.md

10. When gaps are found during any checklist, audit, or review:
    - List every gap with a one-line description.
    - Self-contained, low-risk, unambiguous fix → fix immediately without asking.
    - Architectural decision or non-obvious trade-offs → surface to user. Fix everything else.


================================================================================
CODE REVIEW GATE
================================================================================

Trigger:
  Task complete: run /code-review on the diff before marking [x]. Fix all Critical/High
                 findings before the task is considered done.
  PR:           run all 9 categories below as a manual checklist. Label every finding
                with severity before taking any action.

Severity labels: Critical / High / Medium / Low
  Apply per Constraint #10: Critical/High self-contained fix → fix immediately.
  Architectural or non-obvious trade-off → surface to user. Fix everything else.

Finding format:
  [SEVERITY] Category — file:line — one-line description — fix or ask

9 categories to check:

  Reliability & Performance
  1. Unhandled errors       — missing try-catch, swallowed rejections, no global
                              error middleware
  2. Missing transactions   — two writes that must be atomic but share no transaction
  3. Race conditions        — check-then-act without a lock; non-atomic Redis+Postgres
                              dual writes
  4. N+1 query loops        — serial DB calls inside for-loops that should be batched

  Security
  5. Security               — input validation at system boundaries, auth bypass paths,
                              PII/raw email in logs or responses, injection vectors,
                              missing CSRF on state-changing routes

  AI-generated code structure
  6. Code duplication       — same logic in 2+ files that should be a shared utility
  7. Fat functions          — handler mixes DB, Redis, business logic, and HTTP response
                              in one function with no separation
  8. Hardcoded values       — limits, thresholds, magic numbers that belong in
                              adaptive_config or a named constant
  9. Tight coupling         — handler imports from 3+ services directly, or services
                              call each other circularly with no abstraction layer


================================================================================
WORKING STYLE
================================================================================

Explain before acting. Research before guessing. One change at a time. No jargon.
Every change needs: what it is / how it gets its value / why to trust it.

Full rules + Planning-First workflow: docs/working-style.md
Student profiles (Alex / Jordan / Priya):  docs/student-profiles.md


================================================================================
SPRINT COMPLETION CHECKLIST
================================================================================

Before marking a sprint done, verify:
  [ ] Exit criteria from design doc met
  [ ] No hardcoded threshold values (all in adaptive_config)
  [ ] No raw emails anywhere in code or logs
  [ ] Append-only constraint enforced on all log tables
  [ ] Redis fallback to Postgres tested
  [ ] At least one test per new endpoint

Never cut (non-negotiable for any launch):
  - Auth
  - Problem DB import + tagging
  - Onboarding diagnostic
  - Answer checking (deterministic)
  - At least one working AI hint mode
  - Session restore
  - Privacy notice + consent logging


================================================================================
GOLDEN RULE
================================================================================

Never work on two sprints simultaneously.
Finish each sprint completely before touching the next.
Sequential completion is faster than parallel fragmentation.
