# Scaffold API — multi-step Thévenin problem

Endpoints for fetching profile-conditioned step sequences and submitting per-step answers. Single-shot endpoints (`POST /api/problems/:id/submit`) are unchanged.

All routes require a valid JWT cookie. Auth failures return `401 { "error": "Authentication required" }` or `401 { "error": "Invalid or expired token" }` from [src/api/auth/middleware.ts](../src/api/auth/middleware.ts).

---

## `GET /api/problems/:id/scaffold`

Returns the ordered scaffold steps for the **current student's `learner_profile`**. Ground-truth fields (`is_correct` on MCQ options, `ground_truth_answer` on numeric steps) are **stripped server-side** and never reach the client.

### Success — `200 OK`

```json
{
  "problem_id": "0c4c7c2e-9f8a-4d2a-b8a1-...",
  "variant_id": "f1e2d3c4-...",
  "learner_profile": "distracted",
  "steps": [
    {
      "id": "1f3a...",
      "step_order": 1,
      "step_type": "planning",
      "prompt_text": "Goal: find the Thévenin equivalent at terminals a, b.",
      "options": null
    },
    {
      "id": "2a4b...",
      "step_order": 2,
      "step_type": "mcq",
      "prompt_text": "First, find Vth using your preferred method.",
      "options": [
        { "key": "A", "text": "Nodal" },
        { "key": "B", "text": "Mesh" },
        { "key": "C", "text": "Source Transformation" }
      ]
    },
    {
      "id": "3c5d...",
      "step_order": 4,
      "step_type": "numeric",
      "prompt_text": "Set up your KCL equations and enter your value for Vth (volts).",
      "options": null
    }
  ]
}
```

`step_type` is one of `planning | mcq | numeric | open`. `options` is non-null only for `mcq`.

### Error responses

| HTTP | Body | When |
|------|------|------|
| `400` | `{ "error": "learner_profile not set. Complete onboarding declaration first." }` | Student row has `learner_profile = NULL`. |
| `404` | `{ "error": "No scaffold variant exists for this problem and learner profile" }` | The problem exists but no variant was seeded for this profile. |
| `401` | `{ "error": "Authentication required" }` | Missing JWT cookie. |

---

## `POST /api/problems/:id/steps/:stepId/submit`

Grades one step and appends to the `problem_step_attempts` audit log.

### Request body

```json
{
  "session_id": "uuid",
  "submitted_value": "A",            // string or number; stored as text
  "time_spent_s": 12
}
```

`submitted_value` is interpreted by `step_type`:

- `mcq` — option key (`"A"`, `"B"`, …; case-insensitive match against `options[].key`)
- `numeric` — number; graded via `|sub − gt| / |gt| ≤ tolerance` (defaults to 0.01)
- `planning` / `open` — any value; always `correct: true` (acknowledgment only)

### Success — `200 OK`

```json
{ "correct": true,  "ungraded": false, "misconception_hint": null }   // mcq right or numeric within tolerance
{ "correct": false, "ungraded": false, "misconception_hint": null }   // mcq wrong or numeric outside tolerance
{ "correct": null,  "ungraded": true,  "misconception_hint": null }   // numeric step with NULL ground_truth_answer
{ "correct": true,  "ungraded": false, "misconception_hint": null }   // planning / open
```

`misconception_hint` is always `null` in this sprint — the trigger evaluator is wired in Sprint 3 alongside the AI tutor.

### Error responses

| HTTP | Body | When |
|------|------|------|
| `400` | `{ "error": "session_id, submitted_value, and time_spent_s are required" }` | Any of the three fields is missing or `undefined`. |
| `404` | `{ "error": "Step not found for this problem" }` | `stepId` doesn't exist or belongs to a different `problemId` (cross-problem rejection). |
| `401` | `{ "error": "Authentication required" }` | Missing JWT cookie. |

---

## `POST /api/onboarding/declaration` (modified — now accepts `learner_profile`)

```json
{
  "adhd_flag": true,
  "stress_baseline": 1,
  "course_level": "intro",
  "learner_profile": "starter"        // NEW — optional
}
```

`learner_profile` is one of `starter | exploring | distracted | independent`. If omitted, the existing column value is preserved (via `COALESCE`). If invalid → `400`.

---

## Error handling summary

### What's covered

| Concern | Where |
|---------|-------|
| Auth — JWT verified, `studentId` injected | [middleware.ts](../src/api/auth/middleware.ts) |
| Required-field validation | Each handler — early-return `400` with explicit message |
| `learner_profile` not set | Scaffold handler — `400` before any DB lookup |
| Variant not seeded for profile | Scaffold handler — `404` |
| Cross-problem step IDs (security) | Step-submit — JOIN check on `problem_id` |
| MCQ option lookup (case-insensitive) | Step-submit — `String(submitted_value).trim().toUpperCase()` |
| Ungraded numeric step | Step-submit — returns `correct: null, ungraded: true` instead of crashing |
| Numeric divide-by-zero | Step-submit — explicit `groundTruth === 0` branch |
| Non-finite submitted numeric | Step-submit — `Number.isFinite(submitted)` check |
| Append-only invariant | DB rules block `UPDATE`/`DELETE` on `problem_step_attempts` |
| Ground-truth leakage | Scaffold handler maps `options` and never returns `is_correct` or `ground_truth_answer` (test-asserted) |

### What's NOT covered (intentional or known gaps)

| Concern | Rationale / status |
|---------|--------------------|
| `session_id` not verified to belong to the student | Consistent with existing `POST /:id/submit` and `POST /api/events`. The session FK in the audit table prevents totally fabricated sessions, but a student *could* attribute an attempt to another student's session. Worth tightening project-wide, not this sprint. |
| DB-driver errors (`pool.query` rejections) | Bubble to Express's default error handler → `500` with stack trace in dev. Same pattern as every other handler. A central error middleware would be nice but is out of scope. |
| Rate limiting | Not present anywhere in the project. |
| Schema validation library (zod / joi) | Project uses manual checks — kept consistent. |
| Repeated submissions for the same step | Allowed by design — `problem_step_attempts` is an audit trail. The frontend decides when to advance. |
| Misconception-trigger evaluation | Stored as JSONB but never read this sprint. Wired in Sprint 3 with the AI tutor. |

---

## Quick test recipes (curl)

```bash
# 1. fetch your scaffold (cookie from /api/auth/login)
curl -b cookie.txt http://localhost:3000/api/problems/$PROBLEM_ID/scaffold

# 2. submit an mcq step
curl -b cookie.txt -X POST \
     -H 'Content-Type: application/json' \
     -d '{"session_id":"'$SESSION_ID'","submitted_value":"A","time_spent_s":4}' \
     http://localhost:3000/api/problems/$PROBLEM_ID/steps/$STEP_ID/submit

# 3. submit a numeric step (will return ungraded:true until ground truths are filled in)
curl -b cookie.txt -X POST \
     -H 'Content-Type: application/json' \
     -d '{"session_id":"'$SESSION_ID'","submitted_value":21.333,"time_spent_s":30}' \
     http://localhost:3000/api/problems/$PROBLEM_ID/steps/$STEP_ID/submit
```
