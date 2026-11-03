# 8. Five-Year Strategic Goal Engine

| | |
|---|---|
| **Status** | Implemented (schema, rules, REST API, UI, tests) |
| **Code** | `src/lib/domain/goals.ts` · `src/db/schema/goals.ts` · `drizzle/0002_goal_engine_rules.sql` · `src/features/goals/` · `src/app/api/v1/` |

## 1. The model

```
Five-year vision (narrative, versioned)
└── Five-year goals            level = five_year  (category: financial, business_ownership, professional_identity,
    │                                              skill_mastery, personal_brand, exit_condition, other)
    └── Annual objectives      level = annual
        └── Quarterly objectives   level = quarterly
            └── Monthly targets        level = monthly
                └── Weekly goals           level = weekly
                    └── Daily actions          level = daily
```

- **The vision** (`visions`) holds the narrative: the vision statement, desired professional identity and the retirement/employment exit strategy. Saving always creates a new version.
- **Everything measurable is a goal** (`goals`). The five-year financial target, business ownership goals, skills to master, personal brand goals and each exit condition are `five_year` goals with the matching `category`. Lower levels inherit the category from their parent.
- **Levels may be skipped.** A child must sit strictly *below* its parent, so a monthly target can hang directly under an annual objective.

### Fields on every goal

| Requirement | Column(s) | Notes |
|---|---|---|
| Title | `title` | 1–200 characters |
| Description | `description` | |
| Strategic pillar | `pillar_id` | Same-owner FK to `pillars` (seeded: sales, product, brand, wealth) |
| Start date / Target date | `start_date`, `target_date` | Inside the parent's period and the journey |
| Priority | `priority` | 1 Critical · 2 High · 3 Medium · 4 Low |
| Status | `status` | not_started · in_progress · at_risk · on_hold · achieved · missed · abandoned |
| Success metric | `success_metric`, `unit`, `currency`, `measurement_mode` | `latest` (a level: net worth, followers), `cumulative` (amounts add up: revenue, dials) or `key_results` (an objective's progress = average outcome completion of its key results, see [09](09-roadmap.md)) |
| Target value | `baseline_value`, `target_value` | Target below baseline = reduction goal (debt) |
| Current value | `current_value`, `current_value_as_of` | **Derived** from `goal_measurements` by trigger. The app cannot write it. |
| Completion percentage | `completion_pct` | Generated column: `(current − baseline) / (target − baseline)`, clamped 0–100 |
| Related goals | `goal_links` | Symmetric; kinds related · synergy (reinforces) · tradeoff |
| Dependencies | `goal_dependencies` | Directed; `is_blocking` |
| Notes | `notes` | |

Supporting tables: `goal_measurements` (outcome check-ins), `tasks` (activity), `journeys`, `pillars`, `profiles`, `visions`.

## 2. Outcomes, not activity

A completed task does **not** complete a goal, and neither do achieved sub-goals. This is enforced in the database, not just the UI:

| Rule | Where it's enforced |
|---|---|
| `current_value` comes only from measurements (latest value or baseline + running total). Direct writes are overwritten. | `app.goals_before_write()` trigger |
| `completion_pct` and `is_target_met` are generated from baseline, target and current value | Generated columns |
| `status = 'achieved'` is accepted only when the target is met → otherwise `422 achievement_requires_outcome` | Trigger |
| …and only when every **blocking** prerequisite is achieved → otherwise `422 blocked_by_dependencies` | Trigger |
| Measurements cannot be dated in the future (owner's timezone) → `422 measurement_in_future` | Trigger + service |
| There is **no** trigger from `tasks` or child goals to a goal's progress or status | By design (`src/db/schema/tasks.ts`) |

The goal page shows tasks ("3 of 5 done") and sub-goals ("2 of 4 achieved") as **context**, clearly separated from the outcome. Once achieved, a goal keeps its `achieved_at` even if the metric later dips. It records that the outcome happened.

**Health** (`on_track`, `at_risk` "behind pace", `off_track`, `overdue`, `target_met`, `upcoming`) is advisory. It compares outcome completion with the share of the period elapsed, is computed in `goalHealth()`, and is separate from the owner-controlled status.

## 3. Hierarchy and dependency rules

| Rule | Error (`422`, `code`) |
|---|---|
| Five-year goals have no parent and need a category | `400 invalid_input` (schema) / `constraint_violation` |
| Child level must be below the parent's | `invalid_parent_level` |
| Child period must fall inside the parent's | `outside_parent_period` |
| Goal period must fall inside the journey | `goal_outside_journey` |
| Changing a parent's level or dates may not orphan its children | `children_conflict` |
| No dependency cycles (A → B → C → A) and no self-dependency | `dependency_cycle` / `dependency_self` |
| Yes/no goals accept only 0 or 1 | `boolean_measurement` |

Archiving a goal archives its whole subtree. Restoring requires the parent to be active. Goals with sub-goals or tasks cannot be hard-deleted (FK `restrict`).

## 4. REST API (`/api/v1`)

Authentication: the `__Host-fyos_at` cookie (browser) or `Authorization: Bearer <access JWT>`. Cookie-authenticated writes must come from the app's own origin. Bodies are JSON. Success responses are `{ "data": … }` (or `204`). Errors are `{ "error": { "code", "message", "fieldErrors"? } }`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/journey` | Profile, active journey, pillars, `today` in the owner's timezone |
| POST | `/journey` | Start the journey `{ startDate, timezone, baseCurrency, weekStartsOn?, name? }`. Creates the profile and the four pillars. |
| GET | `/pillars` | Active pillars |
| GET | `/vision` | Current vision version (or `null`) |
| PUT | `/vision` | Save a **new** version `{ statement, professionalIdentity?, exitStrategy?, title? }` |
| GET | `/vision/versions` | All versions, newest first |
| GET | `/goals` | List. Query: `level`, `pillarId`, `status`, `parentId=root\|<id>`, `q`, `includeArchived=true` |
| POST | `/goals` | Create (fields in §1, minus derived ones) |
| GET | `/goals/tree` | Whole hierarchy with health, `blockedBy` and `childCount` per node, counts by level |
| GET | `/goals/:id` | Detail: goal, ancestors, children, prerequisites, dependents, related goals, measurements, tasks, summaries, `achievement` check, `blockers` |
| PATCH | `/goals/:id` | Partial update, including `status` (subject to §2 rules) |
| DELETE | `/goals/:id` | Archive the goal and its sub-goals → `{ archived: n }` |
| POST | `/goals/:id/restore` | Un-archive the goal and its sub-goals |
| GET | `/goals/:id/measurements` | Newest first |
| POST | `/goals/:id/measurements` | `{ measuredOn, value, note? }` → `{ measurement, goal }` (recomputed) |
| DELETE | `/goals/:id/measurements/:measurementId` | → `{ goal }` (recomputed) |
| POST | `/goals/:id/dependencies` | `{ dependsOnGoalId, isBlocking?=true, note? }` |
| DELETE | `/goals/:id/dependencies/:dependsOnId` | |
| POST | `/goals/:id/links` | `{ relatedGoalId, kind?=related\|synergy\|tradeoff, note? }` |
| DELETE | `/goals/:id/links/:relatedId` | |
| GET | `/tasks?goalId=` | Tasks (activity) |
| POST | `/tasks` | `{ title, goalId?, dueOn?, notes? }` |
| PATCH | `/tasks/:id` | `{ status?, title?, dueOn?, notes? }` |

Example:

```bash
curl -s -X POST http://localhost:3000/api/v1/goals \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"level":"five_year","category":"financial","pillarId":"<wealth pillar id>",
       "title":"Net worth ₹1 crore","successMetric":"Net worth","unit":"currency","currency":"INR",
       "baselineValue":500000,"targetValue":10000000,"startDate":"2026-11-01","targetDate":"2031-10-31"}'
```

## 5. Interfaces

| Route | What you do there |
|---|---|
| `/goals` | Vision summary, journey day, counts per level, pillar/status filters, collapsible goal tree with outcome progress, expected-pace marker, health and blocked indicators, and "+ next level" shortcuts |
| `/goals/vision` | Edit the vision, professional identity and exit strategy (versioned, with history). Add and track the measurable five-year goals per category. |
| `/goals/new` | Create a goal. Level-aware parent picker, inherited pillar and category, dates suggested for the level and clamped to the parent. |
| `/goals/:id` | Outcome card (baseline/current/target, chart, measurement log), status with the achievement check, sub-goals, tasks (activity), dependencies, related goals, details and notes |
| `/goals/:id/edit` | Edit every field |

TypeScript interfaces: row and view types are exported from `src/features/goals/server/service.ts` (`GoalRow`, `GoalView`, `GoalTreeNode`, `GoalDetail`, …). Input types come from the Zod schemas in `src/features/goals/schemas.ts` (`GoalCreateInput`, `GoalUpdateInput`, `MeasurementCreateInput`, …).

## 6. Tests

| Suite | Command | Covers |
|---|---|---|
| Unit (8) | `npm test` | Date maths, hierarchy, completion for increase/decrease goals, health, achievement rules, period suggestions |
| Database integration (17) | `npm run test:db` | Runs real migrations on a throwaway database as a non-superuser owner, then tests as the `fyos_app` role: RLS on every table, isolation between users, forged `user_id` and cross-user FKs rejected, no access to `auth`, outcome-only achievement, tasks and sub-goals not completing goals, latest/cumulative/decrease/boolean measurement, future-dated measurements, every hierarchy rule, archive/restore, dependency cycles and blocking, link symmetry, vision versioning |

## 7. Not in this increment

- **Login.** The full flow (password, TOTP, refresh rotation, lockout) is the authentication milestone. This increment ships access-token verification, session checks, logout, and a development-only sign-in (`FYOS_DEV_LOGIN=1` under `next dev` only).
- **Metric-linked goals.** When the metrics engine (M1) lands, goals gain an optional link to a metric definition. Derived values will be written as measurements with `source = 'metric'`, so the outcome rules stay unchanged.
