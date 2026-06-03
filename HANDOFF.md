# Frontend Build — Session Handoff

You are continuing work that was started in a Claude Code session on 2026-05-21.
Read this first, then read [CLAUDE.md](CLAUDE.md) for project rules.

## State as of handoff

**Backend:** Sprint 1 + Sprint 2 done. Sprint 3 (AI tutor) is in progress.
**Frontend:** Phase C done (Tailwind v4 + typed API client + placeholder routes). Two screens generated from Figma so far.

### What's built in [frontend/](frontend/)

- Tailwind v4 (via `@tailwindcss/vite`) — class-based, IBM Plex Sans loaded in [index.html](frontend/index.html).
- Typed API client at [src/lib/api.ts](frontend/src/lib/api.ts) — exports `auth`, `onboarding`, `problems`, `sessions` namespaces. All calls use `credentials: 'include'` to carry the JWT cookie.
- Router at [src/router.tsx](frontend/src/router.tsx) — routes wrap in `<AppShell>` by default; auth/onboarding routes are full-bleed (no shell).

**Implemented routes:**
- `/login` → [LoginRoute.tsx](frontend/src/routes/LoginRoute.tsx). NetID + password. Sends `<netid>@uw.edu` as email to `auth.login()`.
- `/onboarding/self-declare` → [SelfDeclareRoute.tsx](frontend/src/routes/SelfDeclareRoute.tsx). 4-step: basics (course_level + adhd_flag) → 3 Likert sections (Attention / Health / Social). Derives `stress_baseline` from Section 1 average. Calls `onboarding.declaration()`.

**Placeholder routes (need real components):**
- `/register`, `/onboarding/consent`, `/onboarding/diagnostic`, `/problems/:id` — render simple stub cards.

## Figma MCP setup

- Server: **Framelink** `figma-developer-mcp` (REST API + Personal Access Token).
- Token is in [.env](.env) as `FIGMA_API_KEY` (gitignored).
- [.mcp.json](.mcp.json) launches [scripts/figma-mcp.sh](scripts/figma-mcp.sh) which sources `.env` before exec'ing the MCP. **This wrapper exists because shell-style `${VAR}` substitution in `.mcp.json` args is unreliable across MCP clients.** Keep the wrapper.
- File key: `qWB8UPBr4Us99ABkRspWRQ` ("Profile Prototypes (Copy)", owned by jacobl35@uw.edu).
- Tools exposed: `mcp__figma__get_figma_data`, `mcp__figma__download_figma_images`.

### Per-frame generation workflow

1. User pastes a Figma URL like `…?node-id=95-2` (single screen, not a parent SECTION).
2. Call `get_figma_data` with `fileKey` + `nodeId` (convert `-` to `:` if needed). Use `depth: 3` only for catalog views — full frames overflow the response budget on parent nodes.
3. Generate a Tailwind-styled React component using the layout/colors/text from the response.
4. Wire it into [router.tsx](frontend/src/router.tsx) and use the typed API client.
5. Build with `cd frontend && npm run dev` and visit the route.

## Conventions (don't drift from these)

- **One change at a time.** [CLAUDE.md](CLAUDE.md) requires it.
- All components in `frontend/src/routes/` or `frontend/src/components/`. Tailwind classes only — no inline styles, no per-component CSS files.
- Forms use React's `useState`. No form library.
- Network calls **only** through `src/lib/api.ts` — never raw `fetch` in components.
- All component files type-check cleanly (`npx tsc -b` from `frontend/`).
- Match Figma colors exactly when present (e.g. `#615FFF` indigo, `#F8F9FA` background, `#E5E7EB` borders).

## Figma file inventory (from earlier `get_figma_data` at depth 3)

| Section | Status |
|---|---|
| Login + Onboarding + Dashboard | Login ✓, 3 survey sections ✓ (combined into SelfDeclareRoute), 3 Dashboard variants ✗ |
| profile 1 (~32 frames, step 1–17) | Multi-step problem flow for Alex persona — ✗ |
| Profile 2 (~30 frames, step 1–11) | Multi-step problem flow for Jordan persona (ADHD) — ✗ |
| Profile 3 (~13 frames) | Multi-step problem flow for Priya persona (grad) — ✗ |
| Profile 4 (3 frames) | Stub, mostly empty |
| Settings (5 frames) | ✗ |
| Design system | Reference only — not a screen |

## MVP gaps that need design work from the team

1. **Register screen** — not in Figma. Backend `POST /api/auth/register` is ready.
2. **FERPA Consent / Privacy Notice** — not in Figma. **Launch blocker** per CLAUDE.md non-negotiable #2 — onboarding declaration is rejected until `consent_given_at` is set.
3. **Diagnostic vs main-loop problem labels** — unclear which Profile 1/2/3 frames are the 3 cold-start diagnostic problems vs the main loop.
4. **AI hint UI** — Sprint 3 streams hints; need a frame explicitly showing where hints render.

## Decisions made (worth revisiting)

- **NetID → email synthesis:** Login sends `<netid>@uw.edu`. Change if your team wants raw NetIDs as the unique key.
- **"Forgot your password?"** is a placeholder `alert()` — no backend endpoint exists.
- **Survey questions are workplace-themed** ("burned out from work") — design team should rewrite for ECE students.
- **Survey Sections 2 & 3 are collected then discarded.** Only Section 1 feeds `stress_baseline`. If those need persistence, add a new table + endpoint.

## Suggested next moves (in order)

1. **Consent screen** — unblocks everything (declaration calls fail without it).
2. **Register screen** — needed before new users can be onboarded.
3. **Problem viewer** — pick one Profile (likely Profile 1 = Alex), generate the step-1 frame, then iterate through filled/checked variants.
4. **Dashboard** (113:2 / 113:204 / 113:406 in the Figma file).

## How to run

```
# Backend (port 3000)
npm run dev   # from repo root, after setting up .env

# Frontend (port 5173)
cd frontend && npm run dev
```

If port 5173 is occupied, check `lsof -i :5173` — there was a long-running stale Vite squatter on this machine; kill any unrelated `vite` PIDs before starting.
