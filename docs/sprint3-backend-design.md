# ECE Adaptive Scaffold — Backend Design

## 1. What & Why

**What is this?**
A Node.js/TypeScript backend for an adaptive AI tutoring system that teaches ECE students KVL, KCL, phasors, and impedance. It modulates hint depth, pacing, and tone in real time based on each student's cognitive and skill state.

**Why are we doing this?**
Students working through circuit analysis problems get stuck in silence — no personalized, low-latency feedback loop exists. This system closes that gap with a deterministic adaptive engine (Sprints 1–2) and a streaming AI tutor (Sprint 3), targeting a June 1, 2026 launch.

**Scope:**

- In scope: Auth, problem bank, onboarding, session lifecycle, adaptive engine, AI hint delivery, targeted feedback
- Out of scope: Instructor dashboard, SSO/OAuth, frontend rendering, batch hint pre-generation

---

---

# Sprint 1 — Foundation + Problem DB (Apr 14–27) ✅ DONE

## 2. Sprint 1 Work

| Task | Owner | Status | Notes |
|------|-------|--------|-------|
| Deploy Postgres schema via `schema.sql` + `migrate.ts` | lhh | Done | Source of truth; never hand-edited |
| Email auth + JWT in httpOnly cookie | lhh | Done | SHA-256 hash only; raw email never stored |
| Redis session store (`session-store.ts`) | lhh | Done | 24 h TTL, extended on heartbeat |
| Event logging endpoint (`POST /api/events`) | lhh | Done | Append-only; all log tables |
| Problem DB import + tagging (`scripts/import-problems.ts`) | lhh | Done | One-time script |
| Onboarding flow: consent → 3 self-declaration Qs → 3 diagnostic problems | lhh | Done | Consent check gates onboarding |
| Static problem viewer (`GET /api/problems/:id`) | lhh | Done | No AI; deterministic only |
| Skill vector written on onboarding completion | lhh | Done | Seeds `student_skills` from diagnostic |

## 3. Sprint 1 Design Overview

**Architecture:**
Sprint 1 establishes the full data pipeline: Express handles HTTP, Postgres stores durable state via the tables in `schema.sql`, and Redis caches the live session. Auth issues a JWT stored in an httpOnly cookie; every protected route validates it via `requireAuth` middleware. The onboarding flow is gated — consent must be logged before self-declaration can proceed, and the diagnostic must complete before the student reaches the problem viewer.

**Key Data Models:**

```
students          — identity, consent_given_at, adhd_flag, cold_start_done
student_skills    — tier (0–3) per topic, consecutive counters, hint_depth_preference
sessions          — current_problem_state (JSONB), hint_history, last_seen_at
consent_log       — FERPA audit record, timestamped (append-only)
checkin_responses — self-report values over time (append-only)
```

Redis key pattern: `session:{session_id}` — holds `current_problem_id`, `hint_history`, `last_input_at`, `idle_streak_seconds`, `consecutive_errors`, `hints_used_this_problem`.

**API Endpoints:**

| Method | Path | Purpose |
|--------|------|---------|
| POST | /api/auth/register | Create account; hash email; issue JWT |
| POST | /api/auth/login | Verify hash; issue JWT |
| POST | /api/auth/logout | Clear httpOnly cookie |
| POST | /api/onboarding/consent | Log consent; unblock onboarding |
| POST | /api/onboarding/declaration | Write 3 self-declaration answers |
| POST | /api/onboarding/diagnostic | Submit diagnostic answers; seed skill vector |
| GET | /api/problems/:id | Fetch problem (no ground truth in response) |
| GET | /api/problems/next | Pick next problem by weakest skill tier |
| POST | /api/sessions | Create session; seed Redis cache |
| POST | /api/events | Ingest client events (append-only log) |

**Dependencies:**

- Internal: `schema.sql` (DDL), `db/client.ts` (Postgres pool), `redis/client.ts` (ioredis)
- External: Supabase (managed Postgres + Redis), `bcryptjs` (password hash), `jsonwebtoken` (JWT)

## 4. Sprint 1 Key Decisions

| Decision | Alternatives Considered | Why This Choice |
|----------|------------------------|-----------------|
| Email stored as SHA-256 hash only | Store raw email | FERPA/privacy constraint; IRB requirement |
| JWT in httpOnly cookie | LocalStorage / Authorization header | Eliminates XSS token theft vector |
| Redis for live session state | Postgres-only | Profile reads must be <50 ms; Redis hit is <1 ms vs. ~5–15 ms for Postgres |
| Answer check: numeric tolerance ±1% | String match | Circuit answers are floats; string match breaks on "2.00" vs "2" |
| Append-only log tables | Soft-delete flag | IRB audit trail requirement; no UPDATE or DELETE on log tables |

## 5. Sprint 1 Risks & Outcomes

- [x] **Consent gate race condition** — resolved: consent check is synchronous before any onboarding write.
- [x] **Redis cold-start on miss** — resolved: `session-store.ts` falls back to Postgres and re-hydrates; never fails silently.
- [x] **Skill vector not seeded** — resolved: onboarding diagnostic handler writes `student_skills` rows before setting `cold_start_done = true`.

---

---

# Sprint 2 — Adaptive Engine (Apr 28–May 11) ✅ DONE

## 6. Sprint 2 Work

| Task | Owner | Status | Notes |
|------|-------|--------|-------|
| `src/services/skill-updater.ts` — hysteresis tier logic | lhh | Done | 2-consecutive rule; tier clamped 0–3 |
| `src/services/cognitive-state.ts` — stress blend + weight decay | lhh | Done | Self-report weight decays with sessions |
| Wire skill updater + cognitive state into `POST /api/problems/:id/submit` | lhh | Done | Runs on every answer submission |
| `src/services/adaptive-engine.ts` — threshold evaluation + intervention logging | lhh | Done | Returns `InterventionTrigger` or null |
| Wire idle check into `POST /api/sessions/:id/heartbeat` | lhh | Done | Fires every 30 s from client |
| Wire error/hint-budget check into `POST /api/problems/:id/submit` | lhh | Done | Checks after skill update |
| Wire checkin recalculation into `POST /api/events` (checkin_response) | lhh | Done | Recalculates stress + adaptive_config thresholds |
| Unit tests for all three service files | lhh | Done | `*.test.ts` colocated with service |

## 7. Sprint 2 Design Overview

**Architecture:**
Sprint 2 adds three pure-function services wired into existing endpoints. `skill-updater.ts` applies the hysteresis rule to `student_skills` after each answer. `cognitive-state.ts` blends self-report and behavioral signals into `stress_level` and rewrites `adaptive_config` thresholds. `adaptive-engine.ts` reads `adaptive_config` and returns an `InterventionTrigger` when a threshold is breached — the calling handler logs the trigger to `intervention_events`. No AI is involved; all logic is deterministic and testable.

**Key Data Models:**

```
student_skills      — tier, consecutive_up, consecutive_down (updated by skill-updater)
cognitive_state     — stress_level (0–2), focus_quality, idle_streak_s, consecutive_errors
adaptive_config     — idle_threshold_s, error_threshold, hint_budget, response_length_budget
intervention_events — trigger_type, trigger_value (JSONB), response_type (append-only)
state_snapshots     — stress + focus at each state change (append-only)
```

Stress blend formula:

```
stress_level = round(
  self_report_weight × checkin_numeric +
  (1 − self_report_weight) × behavioral_stress_score
)
self_report_weight = max(0.2, 0.8 − 0.1 × sessions_completed)
behavioral_stress = min(2, errorScore + idlePressure)
```

**API Endpoints (enhanced in Sprint 2):**

| Method | Path | Change |
|--------|------|--------|
| POST | /api/problems/:id/submit | + skill update, cognitive state update, intervention check |
| POST | /api/sessions/:id/heartbeat | + idle streak update, idle threshold check |
| POST | /api/events | + checkin_response → stress recalculation |
| GET | /api/sessions/:id | + returns Redis state + Postgres session row |
| POST | /api/sessions/:id/end | + increments `sessions_completed`, deletes Redis key |

**Dependencies:**

- Internal: `session-store.ts` (Redis reads/writes for idle_streak, consecutive_errors), `student_profile` view (stress + thresholds in one query), `adaptive_config` table
- External: None (fully deterministic; no third-party API calls)

## 8. Sprint 2 Key Decisions

| Decision | Alternatives Considered | Why This Choice |
|----------|------------------------|-----------------|
| Hysteresis requires 2 consecutive events to change tier | Single-event tier change | Prevents tier thrash on a lucky/unlucky answer; more stable signal |
| Thresholds written to `adaptive_config` at checkin time, read at check time | Apply multipliers at check time | Check-time reads stay simple (no conditional logic); config is the source of truth |
| Self-report weight decays with `sessions_completed` (floor 0.2) | Fixed weight | Early sessions have no behavioral history; decay shifts trust toward behavior as data accumulates |
| Behavioral stress is clamped to [0, 2] | Unbounded score | Aligns with `stress_level` enum (0, 1, 2); prevents overflow into undefined states |
| Services are pure functions with typed inputs/outputs | In-line logic in handlers | Independently testable; no Express dependency in business logic |

## 9. Sprint 2 Risks & Outcomes

- [x] **Threshold hardcoding** — resolved: all base values (idle=90s, errors=3, hints=3) live in `adaptive_config`; ADHD/stress multipliers applied at config write time.
- [x] **Redis miss during heartbeat** — resolved: heartbeat re-hydrates from Postgres before computing idle streak; never errors silently.
- [x] **Consecutive error counter not reset on correct answer** — resolved: `updateConsecutiveErrors` resets to 0 on `correct = true` before recalculating stress.

---

---

# Sprint 3 — AI Tutor (May 12–May 25)

## 10. Sprint 3 Work

| Task | Owner | Status | Notes |
|------|-------|--------|-------|
| Install `@anthropic-ai/sdk`, add to `package.json` | lhh | Not Started | Unblocks all AI work |
| `src/services/ai-tutor.ts` — SDK wrapper, prompt builder, stream pipe | lhh | Not Started | Core dependency for both endpoints |
| `src/api/hints/handler.ts + router.ts` — `POST /api/hints` | lhh | Not Started | Depends on `ai-tutor.ts` |
| Hint delivery: read profile + Redis → stream haiku → log `hint_events` | lhh | Not Started | |
| `src/api/feedback/handler.ts + router.ts` — `POST /api/feedback` | lhh | Not Started | Depends on `ai-tutor.ts` |
| Targeted feedback: read `problem_attempts` → name error type → stream sonnet | lhh | Not Started | Must never reveal `ground_truth_answer` |
| Wire adaptive-engine `idle` / `error_streak` triggers → auto-hint | lhh | Not Started | Touches `sessions/handler.ts` and `problems/handler.ts` |
| Hint absorption: update `hint_events.absorbed` on next `submitAnswer` | lhh | Not Started | Touches `problems/handler.ts` |
| Tests: hints + feedback endpoints (streaming mocked) | lhh | Not Started | Exit criteria requirement |

## 11. Sprint 3 Design Overview

**Architecture:**
The AI Tutor sits between the adaptive engine (which fires `InterventionTrigger`) and the Express response (which streams to the client). On a hint request, the handler reads the student's live profile from Redis + the `student_profile` Postgres view, assembles a prompt from the CLAUDE.md template, calls the Anthropic streaming API, pipes SSE chunks directly to the response, then appends a row to `hint_events`. Targeted feedback follows the same pattern but reads `problem_attempts` to select the exact error type from `error_taxonomy[]`. Neither endpoint reveals `ground_truth_answer`. Auto-delivery wires the existing `InterventionTrigger` from `adaptive-engine.ts` to immediately invoke the hint handler and push the stream to the waiting client.

**Key Data Models:**

New rows written (append-only):

```
hint_events
  session_id, problem_id, hint_level (1–3),
  hint_text, absorbed (bool, default null),
  time_to_next_attempt_s (set on next submit)

intervention_events   ← already exists; sprint 3 sets response_type = 'hint'
```

Read at request time (no schema changes):

```
student_profile view  — stress_level, adaptive_config thresholds
student_skills        — tier per topic, hint_depth_preference
sessions (Redis-first) — hint_history, current_problem_state, hints_used_this_problem
problem_attempts      — for feedback: last N attempts + error_types[]
```

**API Endpoints:**

| Method | Path | Purpose |
|--------|------|---------|
| POST | /api/hints | Stream AI hint; respects `hint_budget`; logs to `hint_events` |
| POST | /api/feedback | Stream targeted feedback; names error from `error_taxonomy[]` |

Request body (both): `{ "session_id": "uuid", "problem_id": "uuid" }`
Response: `Content-Type: text/event-stream` — SSE chunks until `[DONE]`.

**Dependencies:**

- Internal: `adaptive-engine.ts` (trigger types), `session-store.ts` (Redis reads/writes), `student_profile` view, `cognitive_state`, `adaptive_config`, `hint_events`
- External: Anthropic API — `claude-haiku-4-5` (hints), `claude-sonnet-4-6` (feedback)

## 12. Sprint 3 Key Decisions

| Decision | Alternatives Considered | Why This Choice |
|----------|------------------------|-----------------|
| SSE streaming (not buffered response) | Buffer full response, send at once | Constraint #8: skeleton UI must appear <300 ms; streaming satisfies this naturally |
| haiku for hints, sonnet for feedback | Single model for both | Hints are high-frequency and latency-sensitive; feedback is rare but needs deeper reasoning |
| Read live profile at request time | Pre-cache assembled prompts | Profile can change between heartbeats; stale hints are worse than the extra read latency |
| `absorbed` updated on next `submitAnswer` | Real-time signal from client | Only reliable behavioral signal is whether the next attempt improves |
| `response_length_budget` enforced in prompt as hard instruction | Server-side truncation | Model-level enforcement avoids mid-sentence cutoffs; keeps client code simple |

## 13. Sprint 3 Risks & Open Questions

- [ ] **Anthropic API cold-start latency:** If time-to-first-token exceeds ~1 s, the <300 ms skeleton constraint still holds but the hint feels slow. Needs measurement with a real API key.
- [ ] **SSE disconnect mid-stream:** If the client drops while streaming, the `hint_events` row may be written with incomplete `hint_text`. Decision needed: write partial row or skip logging on disconnect.
- [ ] **Absorption window undefined:** `hint_events.absorbed` is set on the next submit, but the maximum eligible window (e.g., within 5 minutes = absorbed, else null) is not specified. Needs a concrete cutoff before implementation.
- [ ] **`hint_depth_preference` reset condition:** CLAUDE.md defines the flip trigger ("two consecutive `absorbed=false` → set `concrete`") but not the reset-to-`socratic` condition.
- [ ] **No per-student API rate limit:** A rapid hint-request loop could exhaust Anthropic credits. Guard: enforce `hint_budget` from `adaptive_config` at the handler level before calling the API.
