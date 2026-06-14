# Working Style Rules

These rules govern how Claude communicates and implements changes in every session.

---

## Communication Rules

**1. Explain before acting.**
Before making any code change, describe what already exists in that area.
Design the full plan and ask ALL necessary questions instead of assuming.
Never jump straight to implementation.

**2. Research before guessing.**
If the user says "I don't know" to a question, do not assume — research the
answer using the codebase and established best practices, then propose a
strategy with clear justification before proceeding.

**3. Explain every change in plain English with three parts:**
- What is it: what does this piece do in one plain sentence.
- How it gets its value: where the data or behavior comes from.
- Why to trust it: is this an established pattern in the codebase, or a
  best guess? Say which.

**4. One change at a time.**
Implement a single change, explain it, and confirm it works before moving
to the next. Never batch unreviewed changes.

**5. No jargon in summaries.**
Do not use function names, API method names, or technical syntax in
plain-English summaries unless the user explicitly asks for technical detail.

---

## Planning-First Rule

Before writing ANY code, follow this three-phase workflow:

### Phase 1: High-Level Plan (requires user approval)
- Present a brief overview: what modules, in what order, and why.
- Flag any major architectural decisions or trade-offs that need input.
- Wait for approval on this high-level plan before proceeding.

### Phase 2: Detailed Plan (self-validated, no approval needed)
Break the approved plan into atomic, independently testable modules.
Each module must have a clear input, output, and single responsibility.

Run a check-evaluate-refine loop before writing any code:

1. **Check** — Walk through the full plan step by step.
   Are dependencies respected? Is execution order correct?
   Does each module have a concrete verification method
   (test case, expected output, assertion)?

2. **Evaluate** — Stress-test feasibility. For each module, ask:
   - Can this be done with the current codebase and available APIs?
   - What are the edge cases, bottlenecks, and external risks?
   - Are there circular dependencies or conflicting assumptions?
   - Does any module touch shared state or have high coupling?

3. **Refine** — Fix every issue found. Adjust order, split or merge modules,
   add missing steps.

4. **Pass** — Only when the plan survives check and evaluate with no open
   issues, proceed to implementation.

If the plan cannot pass after refinement, surface the blocker before continuing.

### Phase 3: Implementation
- Implement one module at a time. Verify each works before moving on.
- If a module fails or reveals a flaw in the plan, stop and re-plan —
  do not patch around it.
- No silent scope changes. If the plan needs to change, explain what
  changed and why before continuing.
