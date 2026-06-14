# Student Profiles

Design context only — do not change. These profiles drive adaptive_config defaults.

---

## Alex
Sophomore, intro circuits. High stress. Shaky KVL/KCL.

- `response_length_budget` = `medium` (2–3 sentences + follow-up question)
- `idle_threshold` = 60s
- `hint_budget` = 4

---

## Jordan
Junior, AC circuits. ADHD pattern. Fragmented sessions.

- `response_length_budget` = `brief` (short chunked exchange)
- `idle_threshold` = 60s
- `hint_budget` = 4
- `adhd_flag` = true → sets all thresholds to ADHD tier

---

## Priya
Grad student. Confident, time-constrained. Uses system as a verification tool.

- `response_length_budget` = `short` (1 sentence max)
- `idle_threshold` = 180s
- `hint_budget` = 2
