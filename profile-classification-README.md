# Student Profile Classification Specification (v1.0)

## Contents

1. Input
2. Construct Score Calculation
3. Level Mapping
4. Profile Rules
5. Match Score Calculation
6. Profile Assignment
7. Confidence Calculation
8. Tie Breaking
9. Ambiguous Classification
10. Missing Data
11. Invalid Data
12. Output Format

---

## 1. Input

The questionnaire contains **21 items** across five constructs. Each item is
answered on a 1–5 scale.

| Construct            | Items | Range | Direction                                   |
| -------------------- | ----- | ----- | ------------------------------------------- |
| Attention Difficulty | 5     | 1–5   | Higher score = higher attention difficulty  |
| Autonomy             | 4     | 1–5   | Higher score = higher autonomy              |
| Competence           | 4     | 1–5   | Higher score = higher competence            |
| Self-Regulation      | 4     | 1–5   | Higher score = stronger self-regulation     |
| Self-Efficacy        | 4     | 1–5   | Higher score = stronger self-efficacy       |

---

## 2. Construct Score Calculation

For every construct:

```text
Score = Sum(Item Scores) / Number of Items
```

Example — Self-Efficacy responses `4, 5, 4, 3`:

```text
SelfEfficacyScore = (4 + 5 + 4 + 3) / 4 = 4.00
```

---

## 3. Level Mapping

Convert each construct score into a level.

| Score Range | Level  |
| ----------- | ------ |
| 1.00 – 2.75 | Low    |
| 2.76 – 3.50 | Medium |
| 3.51 – 5.00 | High   |

Examples:

```text
AttentionDifficulty = 4.20  → High
Autonomy            = 2.10  → Low
```

---

## 4. Profile Rules

### Profile 1

| Construct            | Required Level |
| -------------------- | -------------- |
| Self-Efficacy        | Low            |
| Self-Regulation      | Low            |
| Attention Difficulty | High           |
| Autonomy             | Low            |
| Competence           | Low            |

### Profile 2

| Construct            | Required Level |
| -------------------- | -------------- |
| Self-Efficacy        | Low OR Medium  |
| Self-Regulation      | Low            |
| Attention Difficulty | Low OR Medium  |
| Autonomy             | Medium OR High |
| Competence           | Low OR Medium  |

### Profile 3

| Construct            | Required Level |
| -------------------- | -------------- |
| Self-Efficacy        | Medium OR High |
| Self-Regulation      | Medium OR High |
| Attention Difficulty | High           |
| Autonomy             | Medium OR High |
| Competence           | Medium         |

### Profile 4

| Construct            | Required Level |
| -------------------- | -------------- |
| Self-Efficacy        | High           |
| Self-Regulation      | High           |
| Attention Difficulty | Low            |
| Autonomy             | High           |
| Competence           | Medium OR High |

---

## 5. Match Score Calculation

For every profile:

```text
Initialize: ProfileScore = 0

For each construct:
    If student level satisfies profile requirement:
        ProfileScore += 1
    Else:
        ProfileScore += 0

Maximum: ProfileScore = 5
Minimum: ProfileScore = 0
```

---

## 6. Profile Assignment

Calculate `Profile1Score`, `Profile2Score`, `Profile3Score`, `Profile4Score`.

```text
AssignedProfile = profile with highest score
```

Example:

```text
Profile1 = 1
Profile2 = 3
Profile3 = 5
Profile4 = 2

Result: AssignedProfile = Profile3
```

---

## 7. Confidence Calculation

```text
Confidence = HighestProfileScore / 5
```

| Score | Confidence |
| ----- | ---------- |
| 5 / 5 | 100%       |
| 4 / 5 | 80%        |
| 3 / 5 | 60%        |
| 2 / 5 | 40%        |
| 1 / 5 | 20%        |

Return: `AssignedProfile`, `Confidence`.

---

## 8. Tie Breaking

If multiple profiles have identical scores, use this priority order:

```text
1. Self-Efficacy
2. Self-Regulation
3. Attention Difficulty
4. Autonomy
5. Competence
```

Compare the highest-priority construct first.

Example:

```text
Profile2Score = 4
Profile3Score = 4

Check: Self-Efficacy match
If Profile3 matches better → AssignedProfile = Profile3
```

---

## 9. Ambiguous Classification

If:

```text
HighestProfileScore < 3
OR
Confidence < 60%
```

Return:

```text
AssignedProfile
Confidence
Flag = Ambiguous
```

---

## 10. Missing Data

```text
If answered items ≥ 75% within construct:
    ConstructScore = average(answered items)
Else:
    ConstructScore = NULL
    ClassificationStatus = Incomplete
    Stop classification.
```

---

## 11. Invalid Data

If a response value is not in `{1, 2, 3, 4, 5}`:

```text
Return: ValidationError
Stop classification.
```

---

## 12. Output Format

```json
{
  "attentionDifficulty": 4.20,
  "autonomy": 2.75,
  "competence": 3.25,
  "selfRegulation": 3.75,
  "selfEfficacy": 4.00,

  "profileScores": {
    "profile1": 1,
    "profile2": 2,
    "profile3": 5,
    "profile4": 2
  },

  "assignedProfile": "Profile3",

  "confidence": 1.0,

  "flag": null
}
```
