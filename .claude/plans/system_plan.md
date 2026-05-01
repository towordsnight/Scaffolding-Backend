Template:  
- initial plan
- your edits
- the final version
and a short retrospective after it's done
("what worked, what broke, what I'd change")

Phase 1 — You define the goal and constraints. "I need X. It must satisfy Y. The boundary conditions are Z." This is your job, never delegate it.
Phase 2 — Ask Claude to produce the plan only. Read it critically. Rewrite the parts that feel wrong. This is where your learning happens — every edit you make to the plan is a rep of the orchestration skill.
Phase 3 — Let Claude execute one step at a time. After each step, review: did it meet the success criteria? Did it break anything? You're the quality gate.
Phase 4 — Gradually widen the loop. Once you trust the plan, let it run 2-3 steps before you check in. Then 5. You're training yourself to know when to zoom in and when to trust the process.

"Before executing any feature, produce a plan with: subtasks, dependencies, success criteria per step, and a retry strategy. Wait for my approval before executing

 # Sprint 1 
 ## completion checklist
 Exit criteria met (code pipeline exists)
 At least one test per new endpoint ← critical gap
 No hardcoded thresholds
 No raw emails
 Append-only enforced in SQL
 seed-cohort-priors.ts ← missing scrip