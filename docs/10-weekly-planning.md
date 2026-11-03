# 10. Weekly Goal Management

| | |
|---|---|
| **Status** | Implemented (schema, rules, REST API, UI, tests) |
| **Code** | `src/lib/domain/weekly.ts` · `drizzle/0005_weekly.sql`, `0006_weekly_rules.sql` · `src/features/weekly/` · `src/app/api/v1/weeks/` · `/week`, `/week/:weekStart` |

## 1. Weekly goals

- **Six focus areas.** Each week has goals in up to six areas: **sales, product development, marketing, content, learning and personal development** (`goals.focus_area`, required for weekly goals).
- **Every weekly goal serves a bigger objective.** It must be linked to a **monthly, quarterly or annual** objective, or to a key result of one. The database enforces this (`weekly_goal_needs_objective`), not only the UI.
- **Dates come from the week.** A weekly goal's period is the week (the owner's week-start day), clamped to its objective's period.
- **Measured by outcome.** Like every goal, a weekly goal is measured by its outcome (success metric, target, measurements). The week page shows which objective it serves.

## 2. Tasks

| Feature | Field / behaviour |
|---|---|
| Break goals into tasks | `tasks.goal_id` |
| Estimated time | `estimated_minutes` (accepts "45m", "1h 30m", "1.5h") |
| Deadline | `due_on` |
| Priority | `priority` 1 Critical · 2 High · 3 Normal · 4 Low |
| Completion | `status`, `completed_at` |
| Actual time spent | `actual_minutes` ("Log time") |
| Planned week | `planned_week`, always normalised to a week start. Defaults to the due date's week. |
| Meaningful deliverable | `is_deliverable`: a real output, as opposed to routine activity |
| Unfinished tasks | Open tasks planned for an earlier week appear at the top of the current week |
| Carry forward / reschedule | **Carry here** (or **Carry all**) moves a task to this week. **Reschedule** sets a new date and its week follows. Both increment `carry_count` and record `carried_from_week`. Tasks carried twice or more are flagged as chronic. |

## 3. Weekly scorecard

**Score = 60% weekly-goal outcome completion + 40% of planned deliverables delivered.** If only one of the two exists, it counts alone.

The number of tasks never raises the score: routine tasks don't count, and cancelled tasks are ignored. The scorecard also shows:

- goals met;
- deliverables delivered out of planned;
- tasks done vs unfinished, carried-in and chronic;
- estimated vs actual time, and estimate accuracy (actual ÷ estimate on finished tasks);
- available hours;
- a breakdown by focus area.

Direct observations, not motivational filler:

| Insight | When |
|---|---|
| Activity not translating into output | ≥ 5 routine tasks done while planned deliverables are unfinished |
| Nothing meaningful to measure | Tasks exist but none is a deliverable |
| Long task lists | More than 25 tasks planned |
| Chronic carry-overs | Unfinished tasks carried forward twice or more |
| Optimistic estimates | Finished tasks took ≥ 25% longer than estimated |
| Over-planned | Estimated task time exceeds the week's available hours |
| No weekly goal | The week has no goal linked to a bigger objective |

**Review.** Completing the weekly review stores wins, lessons and notes, and **freezes the scorecard** in `week_plans.scorecard`. Later edits never rewrite the history, and the page shows both the frozen and the live score. The full accountability review (Prompt 16) builds on this.

## 4. REST API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/weeks/current` | This week: plan, goals by area with tasks, other tasks, unfinished tasks, objective options, scorecard |
| GET / PATCH | `/api/v1/weeks/:weekStart` | Read any week (must be a week start) / `{ focus?, capacityHours? }` |
| POST | `/api/v1/weeks/:weekStart/goals` | `{ focusArea, parentId, title, successMetric, targetValue, unit?, measurementMode?, baselineValue?, priority?, estimatedHours? }` |
| POST | `/api/v1/weeks/:weekStart/carry-forward` | Carry every earlier unfinished task into this week |
| POST | `/api/v1/weeks/:weekStart/review` | `{ wins?, lessons?, notes? }`. Freezes the scorecard. |
| GET | `/api/v1/weeks/recent?count=8` | Weekly score trend |
| POST / PATCH | `/api/v1/tasks`, `/api/v1/tasks/:id` | Now also `plannedWeek`, `priority`, `estimatedMinutes`, `actualMinutes`, `isDeliverable` |
| POST | `/api/v1/tasks/:id/carry-forward` | `{ toWeek?, goalId? }`. Default: the following week. |
| POST | `/api/v1/tasks/:id/reschedule` | `{ dueOn }` |

## 5. Tests

- **`src/lib/domain/weekly.test.ts` (6 tests):**
  - week maths and clamping;
  - the scorecard ignores task volume (20 extra routine tasks don't change it);
  - chronic carry-overs, estimate accuracy and over-planning;
  - cancelled tasks and per-area breakdown;
  - the duration parser.
- **`tests/integration/weekly.test.ts` (5 tests):**
  - the alignment rule (service and database);
  - clamping to the objective;
  - week-start validation;
  - planned-week normalisation;
  - a score of 0 with six routine tasks done and no outcome, rising to 80 with outcome plus deliverable;
  - carry forward, carry all, reschedule and chronic flags;
  - the frozen review scorecard.
