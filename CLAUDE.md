# ECE Adaptive Scaffold — CLAUDE.md
# Read at the start of every Claude Code session.
# Keep this file concise. Link to external files for detail.
# Last updated: April 15, 2026

================================================================================
PROJECT OVERVIEW
================================================================================

Adaptive AI tutoring system for ECE students (KVL, KCL, phasors, impedance).
Modulates hint depth, pacing, and tone based on real-time cognitive/emotional
state. Fixed instructor-authored problem DB. Students only (no instructor
dashboard in MVP).

Build: Solo. Start: Apr 14 2026. Launch: Jun 1 2026.
Stack: Node.js (TypeScript) + Supabase (Postgres + Redis) + Vercel/Railway
AI:    claude-haiku-4-5 (hints), claude-sonnet-4-6 (targeted feedback)
Auth:  Email + JWT (httpOnly cookie). No SSO in MVP.


================================================================================
CURRENT SPRINT
================================================================================

Update this section at the start of each sprint.

SPRINT 1 — Foundation + Problem DB (Apr 14–27) ✅ DONE
Goal: Student can log in, complete onboarding, view a tagged problem.
      No AI. No adaptation. Just a proven data pipeline.

Week 1 (Apr 14–20):
  [x] Deploy Postgres schema (schema.sql already written — source of truth)
  [x] Email auth + JWT (httpOnly cookie)
  [x] Redis session store
  [x] Event logging endpoint

Week 2 (Apr 21–27):
  [x] Problem DB import + tagging script
  [x] Onboarding flow: 3 self-declaration questions + 3 diagnostic problems
  [x] Static problem viewer

Exit criteria: Student registers → completes onboarding → sees a tagged problem.
               Skill vector written correctly. Event log receiving events.

──────────────────────────────────────────────────────────────────────────────

SPRINT 2 — Adaptive Engine (Apr 28 – May 11) ✅ DONE
Goal: System tracks student behavior in real time and updates skill vector and
      cognitive state deterministically. No AI. Every Sprint 3 dependency ready.

Week 1 (Apr 28 – May 4):
  [x] src/services/skill-updater.ts — hysteresis tier logic
  [x] src/services/cognitive-state.ts — stress blend + weight decay
  [x] Wire both into POST /api/problems/:id/submit

Week 2 (May 5 – May 11):
  [x] src/services/adaptive-engine.ts — threshold evaluation + intervention logging
  [x] Wire idle check into POST /api/sessions/:id/heartbeat
  [x] Wire error/hint-budget check into POST /api/problems/:id/submit
  [x] Wire checkin recalculation into POST /api/events (checkin_response)

Exit criteria:
  Correct answer ×2 with 0 hints → tier advances for that topic.
  Checkin response updates stress → adaptive_config thresholds recalculate.
  Idle threshold breach on heartbeat → row written to intervention_events.
  All three service files have unit tests.

──────────────────────────────────────────────────────────────────────────────

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

9. Before writing ANY code, follow the Planning-First Rule (see section below).

10. When gaps are found during any checklist, audit, or review:
    - List every gap with a one-line description.
    - Evaluate the fix: is it self-contained, low-risk, and unambiguous?
    - If yes → fix it immediately without asking for approval.
    - If the fix requires an architectural decision or has non-obvious trade-offs
      → surface only that decision to the user. Fix everything else.


================================================================================
PLANNING-FIRST RULE
================================================================================

Before writing ANY code, follow this three-phase workflow:

Phase 1: High-Level Plan (requires user approval)
  - Present a brief overview: what modules, in what order, and why.
  - Flag any major architectural decisions or trade-offs that need input.
  - Wait for approval on this high-level plan before proceeding.

Phase 2: Detailed Plan (self-validated, no approval needed)
  Break the approved plan into atomic, independently testable modules.
  Each module must have a clear input, output, and single responsibility.

  Run a check-evaluate-refine loop before writing any code:

  1. Check — Walk through the full plan step by step.
     Are dependencies respected? Is execution order correct?
     Does each module have a concrete verification method
     (test case, expected output, assertion)?

  2. Evaluate — Stress-test feasibility. For each module, ask:
     - Can this be done with the current codebase and available APIs?
     - What are the edge cases, bottlenecks, and external risks?
     - Are there circular dependencies or conflicting assumptions?
     - Does any module touch shared state or have high coupling?

  3. Refine — Fix every issue found. Adjust order, split or merge modules,
     add missing steps.

  4. Pass — Only when the plan survives check and evaluate with no open
     issues, proceed to implementation.

  If the plan cannot pass after refinement, surface the blocker before
  continuing.

Phase 3: Implementation
  - Implement one module at a time. Verify each works before moving on.
  - If a module fails or reveals a flaw in the plan, stop and re-plan —
    do not patch around it.
  - No silent scope changes. If the plan needs to change, explain what
    changed and why before continuing.


================================================================================
STUDENT PROFILES (design context — do not change)
================================================================================

Alex   — Sophomore, intro circuits. High stress. Shaky KVL/KCL.
         response_length_budget = 'medium' (2–3 sentences + follow-up question)
         idle_threshold = 60s, hint_budget = 4

Jordan — Junior, AC circuits. ADHD pattern. Fragmented sessions.
         response_length_budget = 'brief' (short chunked exchange)
         idle_threshold = 60s, hint_budget = 4
         adhd_flag = true → sets all thresholds to ADHD tier

Priya  — Grad student. Confident, time-constrained. Uses as verification tool.
         response_length_budget = 'short' (1 sentence max)
         idle_threshold = 180s, hint_budget = 2


================================================================================
AI PROMPT TEMPLATE (Sprint 3 reference)
================================================================================

System:
  You are a circuit analysis tutor.
  Problem: {problem_text}
  Topic: {topic}
  Student tier: {skill[topic]}
  Hint depth: {hint_depth_preference}   [socratic | concrete]
  Response budget: {response_length_budget} sentences maximum.
  Error taxonomy for this problem: {error_taxonomy[]}
  Student's current work: {current_problem_state}

User:
  The student has been idle for {idle_seconds} seconds.
  Deliver a {hint_depth} hint at level {hint_level}.
  Never give the answer. Never exceed the response budget.

Rules:
  - response_length_budget is a HARD constraint. Never exceed it.
  - Never reveal ground_truth_answer.
  - Feedback must name the exact error type from error_taxonomy[].
  - Tone: calm and encouraging for stress_level=2, neutral otherwise.


================================================================================
ADAPTATION LOGIC (reference — implement in Sprint 3)
================================================================================

Idle threshold trigger:
  ADHD or stress_level=2  → 60s
  Default                 → 90s
  Advanced (tier=3)       → 180s

Error threshold trigger:
  ADHD or stressed → 2 consecutive errors
  Default          → 3
  Advanced         → 4

Hint depth flip:
  Two consecutive absorbed=false → set hint_depth_preference = 'concrete'
  Resets per topic (not globally)

Skill tier update (hysteresis — 2 consecutive events required):
  solved with 0 hints    → consecutive_up++. If reaches 2 → tier up, reset counter
  hint budget exhausted  → consecutive_down++. If reaches 2 → tier down, reset counter
  solved with hints used → reset both counters, no tier change

Self-report weight decay:
  self_report_weight = max(0.2, 0.8 - 0.1 × sessions_completed)

Stress blend:
  stress_level = round(
    self_report_weight × checkin_numeric +
    (1 - self_report_weight) × behavioral_stress_score
  )


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
