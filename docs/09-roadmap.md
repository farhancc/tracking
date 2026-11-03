# 9. Annual and Quarterly Roadmap

| | |
|---|---|
| **Status** | Implemented (schema, rules, REST API, UI, tests) |
| **Code** | `src/lib/domain/roadmap.ts` · `src/db/schema/roadmap.ts` · `drizzle/0003_roadmap.sql`, `0004_roadmap_rules.sql` · `src/features/roadmap/` · `src/app/api/v1/roadmap/` |

## 1. What it does

- **Generates the structure.** The five-year journey becomes **5 annual plans** and **20 quarterly execution cycles**, each with dates, a mid-quarter check (week 6) and a quarter review date. Generation is idempotent and never overwrites your edits.
- **Seeds provisional directions only.** Each year starts with the direction you gave (Year 1 *Foundations* … Year 5 *Scale and independence*), marked **Provisional** until you confirm it. Every theme, direction and note is editable.
- **Invents no targets.** No objectives, key results, KPIs or numbers are created for you. Instead, every quarter is checked against your available time and your track record (§3).

| Year | Theme | Provisional direction |
|---|---|---|
| 1 | Foundations | Build sales competence, improve communication, validate and sell software products. |
| 2 | Traction | Improve sales performance, grow product revenue, develop consistent content publishing. |
| 3 | Recognition | Build a recognizable personal brand, establish customer acquisition systems and test paid workshops. |
| 4 | Systems | Develop courses, expand software revenue and establish repeatable business operations. |
| 5 | Scale and independence | Scale educational and software businesses, build a team and evaluate employment independence. |

## 2. What each quarter holds

| Element | How it's modelled |
|---|---|
| **3–5 major objectives** | Quarterly-level goals (from the goal engine) whose period starts in the quarter. "Add objective" pre-fills a quarterly goal measured **from key results**. |
| **Key results** | Goals with `is_key_result = true`, children of the objective, at the same level. Each has its own success metric, baseline, target and measurements. |
| **Objective progress** | Measurement mode `key_results`: the objective's current value is the **average outcome completion of its key results** (0–100%), recomputed by trigger. It cannot take direct measurements, and it can be marked achieved only when every key result is met. Tasks and deliverables never move it. |
| **Deliverables** | `quarter_deliverables`: concrete outputs, optionally tied to an objective, with due date, effort estimate, status (planned → in progress → delivered / dropped), delivery date and evidence |
| **KPIs** | `quarter_kpis`: health metrics with unit, direction (good when at/above or at/below target), target and actual. Attainment 0–100%. |
| **Risks** | `quarter_risks`: likelihood × impact (1–25), mitigation, status open / mitigated / occurred / closed |
| **Dependencies** | `quarter_dependencies`: external needs (people, tools, approvals), optionally linked to a goal, with a needed-by date. Goal-to-goal dependencies remain in the goal engine. |
| **Review dates** | `mid_review_on`, `review_on`, a written review, and "reviewed" (`reviewed_at`) |

## 3. Realism checks (no unrealistic targets)

The quarter page's **Plan check** combines three inputs:

1. **Available time**: hours per week, set once (Roadmap → Available time) and adjustable per quarter. Capacity = hours/week × weeks in the quarter.
2. **Planned effort**: for each objective, the larger of its own estimate and the sum of its deliverables' estimates, plus deliverables not tied to an objective. A partial breakdown never hides the whole, and nothing is double-counted.
3. **Track record**: across past or reviewed quarters, the share of planned deliverables actually delivered, and the average objective completion.

| Warning | When |
|---|---|
| `over_capacity` / `near_capacity` | Planned effort > 100% / > 85% of available time |
| `too_many_objectives` / `few_objectives` / `no_objectives` | More than 5 / fewer than 3 / none |
| `objectives_without_key_results` | An objective has no key results, so it can't be measured |
| `above_track_record` | Planned deliverables exceed 1.25 × your historical per-quarter delivery |
| `low_past_completion` | Previous objective completion averaged below 50% and more than 3 objectives are planned |
| `no_capacity` / `no_estimates` | Missing inputs, so the check can't run |

## 4. Planned versus actual

- **Roadmap dashboard:**
  - A chart of deliverables planned vs delivered per quarter, plus objective completion.
  - The current quarter's progress against time elapsed.
  - Per-year annual objectives with completion against the share of the year elapsed.
  - Quarter tiles showing objectives, deliverables, KPI attainment, open risks and "review due".
- **Quarter page:** the same numbers in detail.

## 5. REST API (`/api/v1/roadmap`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/roadmap` | Years with quarters, current quarter, planned-vs-actual series |
| POST | `/roadmap/generate` | Create the 5 years and 20 quarters (idempotent) |
| PATCH | `/roadmap/settings` | `{ weeklyCapacityHours, applyToFutureQuarters? }` |
| PATCH | `/roadmap/years/:year` | `{ theme?, direction?, isProvisional?, notes? }` (year 1–5) |
| GET | `/roadmap/quarters/:quarter` | Quarter 1–20: objectives with key results, deliverables, KPIs, risks, dependencies, actuals, plan check, history |
| PATCH | `/roadmap/quarters/:quarter` | `{ focus?, capacityHoursPerWeek?, midReviewOn?, reviewOn?, reviewSummary?, reviewed? }` |
| POST | `/roadmap/quarters/:quarter/deliverables` · `/kpis` · `/risks` · `/dependencies` | Add an item |
| PATCH / DELETE | `/roadmap/deliverables/:id` · `/kpis/:id` · `/risks/:id` · `/dependencies/:id` | Update or remove an item |

Objectives and key results use the goal API (`POST /api/v1/goals` with `measurementMode: "key_results"`, or with `isKeyResult: true` and the objective as `parentId`).

## 6. Tests

`src/lib/domain/roadmap.test.ts` (6 unit tests) and `tests/integration/roadmap.test.ts` (9 database tests):

- 5 contiguous years and 20 contiguous quarters, with no targets invented
- Idempotent generation that keeps edits
- Capacity propagation
- Objective progress only from key-result outcomes, plus the achievement rule
- Key-result nesting rules
- Deliverable delivery dates and dropped items
- KPI attainment for up and down KPIs, and risk scores
- Planned-hours maths
- Over-capacity and track-record warnings
- Review-date constraints
