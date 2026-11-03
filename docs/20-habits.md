# 20. Habit and Discipline Tracker

| | |
|---|---|
| **Status** | Implemented (schema, DB rules, REST API, UI, tests) |
| **Code** | `src/lib/domain/habits.ts` · `src/db/schema/daily.ts` (habits, habit_checkins, rest_days) · `drizzle/0025_habits.sql`, `0026_habits_rules.sql` · `src/features/habits/` · `/habits`, `/habits/:id` |

This extends the minimal habits behind the Today screen (docs/11). Both screens use the same tables, so a check-in on one shows on the other.

## 1. Habits

The nine habits from the plan are created on first visit if you have none:

| Habit | Schedule |
|---|---|
| Wake up on time | Every day |
| Exercise | 3× a week, any days |
| Read | Every day |
| Practice communication | Weekdays |
| Study sales | Weekdays |
| Work on my product | Weekdays |
| Publish or prepare content | 3× a week, any days |
| Review daily goals | Every day |
| Sleep on time | Every day |

"Add any missing suggested habits" adds the ones you don't have.

Habits can be:

- **created**;
- **edited**: name, description, schedule, start date;
- **archived**: hidden, history kept;
- **deleted**: permanently, together with every check-in. This needs a ticked confirmation in the UI and `{ "confirm": true }` in the API, and reports how many check-ins were removed.

**Flexible schedules** (`schedule_kind`):

- `days`: specific weekdays.
- `weekly`: `weekly_target` times a week on any days. These show on Today every day with "2/3 this week".

`started_on` means a habit is never judged before it existed. A check-in before that date (backfilling) moves the start back automatically (trigger).

## 2. Check-ins and rest

| Status | Meaning | Counts as |
|---|---|---|
| `done` | Did it | Done |
| `skipped` | Didn't, optionally with a note on what got in the way ("Not today?") | Missed |
| `rest` | Planned rest for this habit | Excused, not expected |
| *(none)* | On a past scheduled day: missed. Today: **pending**, never counted against you | |

- **Rest days** (`rest_days`): illness, travel, holidays. Every habit is excused that day. They can be planned ahead, and "Take today off" adds one for today.
- Check-ins can't be in the future.

Until now, the Today screen's Rest button stored `skipped`. Migration 0026 converts those rows to `rest`, and from now on Today's daily progress excludes rest while counting skipped as not done.

## 3. No arbitrary penalties

There are no points, lives or penalties.

- A missed day is shown as data (an outlined dot) and never wipes anything out.
- Rest days and unscheduled days neither break nor extend a streak.
- The best streak is always shown next to the current one.
- **Today never counts against you until it's over.**
- **Flexible make-up:** for weekday habits, doing it on an unscheduled day makes up for a missed scheduled day in that period (never above 100 %).
- **Weekly targets:** each rest day in a week lowers that week's target by one, and an unfinished week below target is left out until it ends.

## 4. Measures

| Measure | Definition |
|---|---|
| Daily check-ins | `/habits` and `/today`: one tap done / undo, Rest, or "Not today?" with a reason |
| Weekly consistency | This week: done ÷ expected (weekday habits) or within-target done ÷ target (weekly habits) |
| Monthly consistency | The same for the calendar month to date |
| Streaks | Weekday habits: consecutive scheduled days done. Weekly habits: consecutive weeks meeting the target. Current and best. |
| Missed habit analysis | Last 90 days: missed days (or weeks below target), missed days by weekday with the hardest day named, and your most recent reasons. Shows the 6 habits with the most misses; the rest are folded away. |
| Habit history | `/habits/:id`: a week-by-week dot grid up to a year back, times done, all-time consistency, streaks, notes |
| Consistency trend | All habits, 12 weeks (bar chart with a text equivalent) |
| Habits and productivity | Per habit: the share of the day's **MITs** (top three priorities) completed on days it was done vs days it wasn't, over 90 days |

On the productivity comparison:

- It uses MIT completion because it measures whether the chosen priorities got done, not how many tasks were finished. The plan rules out rewarding task counts.
- It is shown only with ≥ 5 days in each group, along with the sample sizes, and is labelled as a **correlation, not proof** of cause.
- Days are drawn with shapes as well as colour: filled = done, outlined = missed, dashed = rest, ring = today, faint = not scheduled.

## 5. REST API

| Method | Path | Purpose |
|---|---|---|
| GET / POST | `/api/v1/habits` | Active habits / create `{ name, scheduleKind?, scheduleDays?, weeklyTarget?, startedOn?, description?, pillarId? }` |
| GET | `/api/v1/habits/overview` | Everything on `/habits` (seeds the defaults on first use) |
| POST | `/api/v1/habits/suggested` | Add missing suggested habits |
| GET / PATCH / DELETE | `/api/v1/habits/:id` | History / edit or `{ archived: true }` / delete with `{ confirm: true }` |
| PUT | `/api/v1/habits/:id/checkins?day=` | `{ status: "done" \| "skipped" \| "rest" \| null, note? }` |
| POST / DELETE | `/api/v1/rest-days`, `/api/v1/rest-days/:id` | `{ day, reason? }` |

## 6. Navigation

With twelve screens, the single row of links no longer fit at 1280 px. The main nav (`src/components/main-nav.tsx`) is now:

- **Today, Week, Habits**
- **Grow:** Sales, Speak, Psychology, Knowledge
- **Build:** Products, Content
- **Plan:** Goals, Roadmap, Vision

Behaviour:

- The current page is highlighted (`aria-current`), and its group reads, for example, "Grow · Psychology".
- Menus close on navigation, an outside click or Escape.
- On phones the nav sits on its own full-width row.
- `MainNav` reads `usePathname()`, so with Cache Components it sits inside `<Suspense>`, with the same nav and no active item as the fallback. Without that, dynamic routes such as `/week/[weekStart]` can't be prerendered.

## 7. Tests

- **Unit** (`habits.test.ts`):
  - today pending, rest days excused, before-start days ignored
  - make-up on another day
  - weekly targets reduced by rest days, with unfinished weeks left out
  - streaks through rest and unscheduled days, and the best streak
  - hardest weekday and reasons
  - the correlation, refused with too little data
  - the weekly trend
- **Unit** (`daily.test.ts`): rest excluded from Today's progress; skipped counts as not done.
- **Unit** (`main-nav.test.ts`): most-specific active entry; every screen listed once.
- **Integration** (`tests/integration/habits.test.ts`, real migrations under the RLS app role):
  - the nine defaults, seeded once
  - editing between schedule types; a weekly habit without a target is rejected
  - deleting reports and removes its check-ins
  - backfilling moves the start date; future check-ins are rejected
  - streak and 30-day consistency with a missed day and a rest day; reasons
  - a global rest day; the history grid
  - owner isolation
  - the MIT correlation from real tasks
- **Browser** (Playwright):
  - one-tap check-in, rest and skip-with-reason
  - the consistency table, missed analysis, and the correlation's "not enough data" message
  - a weekly habit without a target is refused, with the name kept
  - edit; delete refused until confirmed, then deleted
  - the history page; the Today page reflects the check-in
  - the nav at 1280 px and 390 px: no overflow, active state, menus closing on navigation and Escape
  - no overflow at 390 px
