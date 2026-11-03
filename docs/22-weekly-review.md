# 22. Weekly Review and Accountability Engine

| | |
|---|---|
| **Status** | Implemented (schema, DB rules, REST API, UI, tests) |
| **Code** | `src/lib/domain/review.ts` · `src/db/schema/review.ts` · `drizzle/0029_week_reviews.sql`, `0030_week_reviews_rules.sql` · `src/features/review/` · `/review`, `/review/:weekStart` (Plan → Weekly review; also linked from each week page) |

This builds on weekly planning (docs/10). Completing a review also completes the week's own review, which freezes its scorecard and copies the biggest achievement, lesson and next-week change into wins, lessons and notes.

## 1. The twelve questions

| # | Question | Answered by |
|---|---|---|
| 1 | What were my planned goals? | **Data**: the week's weekly goals with their completion |
| 2 | What did I actually complete? | **Data**: goals met and deliverables finished, plus a note for anything untracked |
| 3 | Which goals were missed? | **Data**: goals not met, with progress against the target |
| 4 | Why did I miss them? | You: a reason per missed goal (took longer than estimated, interruptions, priorities changed, low energy, waiting on someone, avoided it, too ambitious, unclear, other) plus what happened. **Required to complete the review.** |
| 5–12 | Biggest achievement, what I learned, what generated revenue, what generated customer interest, what wasted my time, stop, continue, change next week | You, in writing. Questions 7–9 show the tracked numbers next to the box (deals won, product revenue, income; new prospects and how many came from content, interviews and commitments, feedback, content published; share of time on non-deliverables, chronic carried tasks). |

The default week is this week from its last two days on, otherwise last week. Future weeks can't be reviewed (`week_not_started`, also enforced in the database). Answers save as a draft. **Complete review** freezes the report and observations in `week_reviews.snapshot`, so later edits to the data don't rewrite history.

## 2. Weekly performance report across the four pillars

`gatherSignals()` reads the week from every module:

| Pillar | Numbers |
|---|---|
| Sales mastery | Activities, cold calls and connect rate, meetings booked, new prospects (and from content), deals won by currency, communication practice sessions and minutes, psychology reviews |
| Product entrepreneurship | Product revenue by currency (net of refunds), customer interviews and commitments to pay, feedback, features shipped, releases, validation steps validated |
| Personal branding | Content published, prospects attributed to content |
| Financial independence | Income recorded (by source), spending recorded |
| Across pillars | Weekly goals met per pillar, deliverables, time logged (deliverable vs routine), estimate accuracy, carried and chronic tasks, MITs set and done, habit consistency (vs last week, weakest habit), reading minutes and resources finished |

## 3. Direct observations, not motivation

`observations()` turns the numbers into plain statements, each tagged good, neutral or concern (icon plus text). Examples:

- "Met 1 of 3 weekly goal(s) (33%)."
- "10h logged on tasks; 80% of it on routine tasks that aren't deliverables."
- "Finished tasks took 1.6× their estimates."
- "Shipped 3 features without a single customer conversation logged."
- "Habit consistency 60% (down 20 points on last week); weakest: Exercise at 20%."
- "Active objectives here, but no weekly goal or tracked activity this week." (for a pillar with open objectives that saw nothing)

There is no praise text, no generic advice, and nothing without a number behind it.

## 4. Recurring patterns

`recurringPatterns()` looks at this week plus up to seven earlier completed reviews. A pattern needs at least three occurrences (two for a repeated "stop doing"):

- the same reason for missed goals, e.g. "'Took longer than estimated' was a reason in 3 of the last 4 weeks"
- the same focus area missed again and again
- estimates overrun by 30 %+ in 3 or more weeks
- a pillar with no weekly goal in 3 or more weeks
- the same "stop doing" written repeatedly ("…It hasn't stopped yet.")
- the score falling three weeks running

## 5. Suggested goals for next week: approve or modify

`suggestGoals()` proposes:

| Kind | When | Suggestion |
|---|---|---|
| Retry | A goal was missed and its objective is still open | The same goal, same objective, same target |
| Smaller | Missed because it was too ambitious or took longer than estimated | The same goal at half the remaining target |
| Gap | A pillar has an open objective but had no weekly goal | "Move '<objective>' forward" under that objective |

Goals missed because priorities changed aren't suggested again. Each suggestion is an **editable form**: title, focus area, objective, success metric and target. It is only created, as a goal for the following week, when you press **Approve**, and then shows "Added". The "change next week" answer can be set as next week's focus with one click.

## 6. REST API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/reviews?week=` | Report, signals, scorecard, observations, patterns, answers and suggestions |
| GET / PUT | `/api/v1/reviews/:weekStart` | Read / save answers as a draft |
| POST | `/api/v1/reviews/:weekStart/complete` | Complete (`reasons_required` if a missed goal has no reason) |
| POST | `/api/v1/reviews/:weekStart/suggestions` | Approve an (edited) suggestion: same body as a weekly goal |
| POST | `/api/v1/reviews/:weekStart/focus` | `{ focus }` becomes the following week's focus |

## 7. Tests

- **Unit** (`review.test.ts`):
  - observations quote the numbers across pillars
  - patterns appear only when they recur
  - retry, smaller and pillar-gap suggestions; no retry when priorities changed or the objective is closed
- **Integration** (`tests/integration/review.test.ts`, real migrations under the RLS app role):
  - signals from goals, measurements and timed tasks; observations, including a neglected pillar
  - draft save; completing refused without reasons, then completed and frozen; the week marked reviewed
  - "too ambitious" gives a half-target suggestion; approval creates next week's goal and marks it added
  - next week's focus set
  - future week refused; owner isolation
- **Browser** (Playwright):
  - report and pillar cards
  - completing refused without a reason, with the typed answers kept
  - completing with a reason; approving an edited suggestion; setting the focus
  - next week shows the goal and the focus; the reviewed week is marked
  - no overflow at 390 px
