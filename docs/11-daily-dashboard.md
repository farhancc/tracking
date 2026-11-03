# 11. Daily Execution Dashboard

| | |
|---|---|
| **Status** | Implemented (schema, rules, REST API, UI, tests). **The app now opens on `/today`.** |
| **Code** | `src/lib/domain/daily.ts` · `src/db/schema/daily.ts` · `drizzle/0007_daily.sql`, `0008_daily_rules.sql` · `src/features/today/` · `src/app/api/v1/today/` |

## 1. What you see each morning

The page is one column with the most frequent actions in thumb reach. The only number is daily progress; there is no other analytics.

1. **Today's date**, **journey day** ("Day 34 of 1,826 · Year 1"), time left vs time available, and a **daily progress ring**.
2. **Direction:** the current annual objective, the current quarterly objective and **this week's priorities** (weekly goals), each with its outcome %.
3. **Today's mission:** three ranked slots (most important, second, third). Fill a slot by picking from today's or this week's tasks, or by typing a new one.
4. **Overdue** (if any): tasks scheduled on earlier days that are still open, with **Move all to today** or **Today** per task. Moving a task into a later week counts as a carry-forward (see [10](10-weekly-planning.md)).
5. **Scheduled:** tasks with a start time, in time order.
6. **Daily execution:** today's checklist. Each row shows estimated duration, actual duration, start and finish times and status, with a 44 px **complete** button and a **Start / Finish** button. **Pull from this week** schedules any of the week's open tasks for today.
7. **Habit checklist:** today's scheduled habits as large toggles, with **Rest** for planned rest days (rest days don't count against you).
8. **Available time** ("3h 30m"). The header warns when the open work exceeds it.
9. **Daily reflection:** what did I accomplish, learn, what went wrong, what should I improve tomorrow. Expanded automatically after 17:00 or once filled in.
10. **Quick add bar** fixed to the bottom of the screen (safe-area aware) for one-handed capture.

## 2. Rules

| Rule | Where |
|---|---|
| Exactly one task per mission slot per day | Unique index `tasks_one_mit_per_rank`. Setting a slot moves the previous task out (it stays scheduled for today). |
| **Start** stamps `started_at` and sets status *doing*. **Finish** stamps `finished_at`. Actual duration = elapsed time, unless you logged it yourself. | Service + `app.tasks_before_write` |
| `planned_week` follows the planned week, scheduled day or due date (in that order), always as a week start | Trigger |
| Habit check-ins can't be in the future (owner's timezone) | `app.habit_checkins_validate` |
| Days are the owner's local calendar days | `profiles.timezone` |

**Daily progress = 50% mission tasks done + 30% other planned work done (weighted by estimated minutes; 30 min assumed when unestimated) + 20% scheduled habits done** (rest days excluded). Parts with nothing planned are dropped and the rest re-weighted, and cancelled tasks are ignored. Weighting by minutes means ten 5-minute chores can't outweigh one 4-hour deliverable. This is *execution* progress for the day; strategic progress stays outcome-based on the goal pages.

## 3. Data

| Table / column | Purpose |
|---|---|
| `tasks.scheduled_on`, `scheduled_start` | The day (and optional time) a task is planned |
| `tasks.started_at`, `finished_at` | Start and finish times |
| `tasks.mit_on`, `mit_rank` | Today's mission slot (1–3) |
| `day_plans` | One row per day: available minutes, the four reflection answers, `reflected_at` |
| `habits` | Name, scheduled weekdays (`schedule_days`, 0 = Sunday), optional pillar. Minimal version; the habit module (Prompt 14) extends it. |
| `habit_checkins` | One per habit per day: `done` or `skipped` (rest day) |

## 4. REST API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/today?day=` | The whole dashboard (defaults to today in your timezone) |
| POST | `/api/v1/today/tasks?day=` | Quick add `{ title, estimatedMinutes?, scheduledStart?, goalId?, mitRank?, isDeliverable? }` |
| PUT | `/api/v1/today/mits?day=` | `{ rank, taskId \| null }` |
| POST | `/api/v1/today/carry-overdue?day=` | Move every overdue open task to the day |
| PUT | `/api/v1/today/plan?day=` | `{ availableMinutes }` |
| PUT | `/api/v1/today/reflection?day=` | `{ accomplished?, learned?, wentWrong?, improveTomorrow? }` |
| POST | `/api/v1/tasks/:id/start` · `/finish` · `/schedule-today` · `/unschedule` | Execution controls |
| GET / POST | `/api/v1/habits` | List / create `{ name, scheduleDays, pillarId?, description? }` |
| PUT | `/api/v1/habits/:id/checkins?day=` | `{ status: "done" \| "skipped" \| null }` |

## 5. Tests

- **`src/lib/domain/daily.test.ts` (5 tests):**
  - journey day and calendar year (leap-year safe);
  - progress weighting, including exact .5 rounding;
  - many small tasks never outweighing a big one;
  - empty days;
  - weekday schedules.
- **`tests/integration/today.test.ts` (8 tests):**
  - one task per mission slot;
  - pulling last week's task into today counts as a carry;
  - overdue carry;
  - start/finish deriving 25 minutes, and a manual log being kept;
  - progress and time available vs planned;
  - habit schedule, check-in, undo and the future-date rule;
  - reflection;
  - direction (annual, quarterly, weekly).
- **Browser check (390 × 844 touch viewport):**
  - set slots by picking and by typing;
  - start/finish; habit done and rest day; quick add; move overdue; save reflection;
  - no horizontal overflow, and the quick-add bar stays at the bottom of the screen.
