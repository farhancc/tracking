# 19. Knowledge and Reading Management

| | |
|---|---|
| **Status** | Implemented (schema, DB rules, REST API, UI, tests) |
| **Code** | `src/lib/domain/knowledge.ts` · `src/db/schema/knowledge.ts` · `drizzle/0023_knowledge.sql`, `0024_knowledge_rules.sql` · `src/features/knowledge/` · `/knowledge`, `/knowledge/:id` |

## 1. Resources

`knowledge_resources` covers books, courses, research papers, podcasts, videos, articles, sales case studies and personal observations.

| Field | Notes |
|---|---|
| Title, author/creator, category | Category is free text, with suggestions from earlier entries |
| Start date, completion date | Both actual, never in the future; completion ≥ start |
| Rating | 1–5 |
| Notes | Long-form |
| Important concepts | `knowledge_concepts`: concept and your own explanation |
| Practical applications | `knowledge_applications` (§3) |
| Status | Want to read → In progress → Completed / Stopped. Starting sets the start date; completing sets the completion date (default today) and the progress to the full length. |
| Length and progress | Pages (books, papers), lessons (courses) or minutes (podcasts, videos) |
| Supports goal | Optional link to a strategic goal |
| Link | |

The library filters by type and status and searches titles, authors and notes. Each card shows progress, rating, concepts and "applied / applications".

## 2. Reading goal and daily tracker

- **Reading goal** (`reading_goals`, one per year): resources to complete this year, which types count (default books), and a daily minutes target. Progress is shown against an **even pace**, labelled as a reference ("even pace would be 15.1 by today"), not a forecast.
- **Daily reading log** (`reading_sessions`): date (not in the future), minutes, optional units, resource and note. Logging against a resource starts it if needed and can move its progress ("reached page 170"; it can't exceed the length).
- The tracker shows:
  - today's minutes against the target
  - a 7-day bar strip
  - a **streak** of days meeting the target, where today only counts once it's met, so an unfinished today never breaks it
  - days read in the last 30

## 3. From knowledge to real-world implementation

An application belongs to a resource (and optionally a concept) and has a status (planned, practising, done, dropped), a result and the date it was applied.

**Create a practice task** (on by default) adds a task to this week's plan:

- titled "Practise: …"
- noting the source
- linked to the resource's goal, if it has one

The application then moves to Practising and shows the task's live status.

To **link to the sales performance journal**, either:

- pick an existing journal entry, or
- use **Write it into the sales journal**.

The second creates the entry from the application: what they said, what you said, whether it worked, the lesson. It is tagged `from-reading`, a "Successful response" if it worked and otherwise a "Lesson", and is linked back.

The plan's example works end to end: *Never Split the Difference* → concept "Tactical empathy" → application "Label the buyer's concern before answering price objections" → a practice task in the week plan → a journal entry recording that it worked → marked done with the result.

Other connections:

- **Add to psychology lab** copies a concept into the sales psychology lab (docs/14) for spaced review, with the resource as its source. It starts as "practitioner experience" (or "limited" for papers), so a book's claim is never presented as established science until you check it.
- A concept used by an application can't be deleted (`concept_in_use`). Deleting an application keeps its task and journal entry.

"Knowledge applied" on `/knowledge` counts completed resources with at least one application done.

## 4. REST API (`/api/v1/knowledge`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/knowledge` | Overview: resources, reading goal and stats, practising count, knowledge applied |
| GET / POST | `/knowledge/resources?kind=&status=&category=&q=` | List / create |
| GET / PATCH | `/knowledge/resources/:id` | Detail (concepts, applications with task and journal entry, sessions, recent journal entries) / update |
| POST · DELETE | `/knowledge/resources/:id/concepts` · `/knowledge/concepts/:id` | Concepts |
| POST | `/knowledge/concepts/:id/promote` | `{ category }`: copy to the psychology lab |
| POST | `/knowledge/resources/:id/applications` | `{ description, conceptId?, createTask?, journalEntryId? }` |
| PATCH / DELETE | `/knowledge/applications/:id` | Status, result, applied date, journal link |
| POST | `/knowledge/applications/:id/journal` | Write a sales journal entry and link it |
| GET · PUT | `/knowledge/reading` · `/knowledge/reading/goal` | Stats / `{ year, targetCount?, kinds?, dailyMinutes? }` |
| POST · DELETE | `/knowledge/reading/sessions` · `/knowledge/reading/sessions/:id` | `{ minutes, readOn?, units?, resourceId?, note?, progressTo? }` |

Same-owner composite foreign keys link applications to tasks and journal entries. This needed `unique (id, user_id)` on `tasks` and `sales_journal_entries`, added in migration 0023.

## 5. Tests

- **Unit** (`knowledge.test.ts`): daily reading stats and a streak that today can't break; yearly goal against an even pace.
- **Integration** (`tests/integration/knowledge.test.ts`, real migrations under the RLS app role):
  - the negotiation-book flow end to end:
    - logging starts the book and moves progress; progress beyond the length is rejected
    - concept → application → practice task in the week plan → journal entry (kind, tag, source line) → done, with the applied date
  - promoting to the psychology lab, once
  - a concept in use can't be deleted
  - completion dates and full progress; future and inverted dates rejected
  - search; owner isolation
  - goal progress by counted types, and the streak
- **Browser** (Playwright):
  - the tracker, goal and knowledge-applied cards; logging reading updates the streak
  - adding a book; a concept; an application with a practice task
  - writing to the sales journal, then checking that the journal and week pages show it
  - promoting to the psychology lab; the concept-in-use refusal
  - no overflow at 390 px
