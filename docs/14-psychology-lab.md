# 14. Sales Psychology and Human Behaviour Learning Lab

| | |
|---|---|
| **Status** | Implemented (schema, DB rules, REST API, UI with spaced review, tests) |
| **Code** | `src/lib/domain/psychology.ts` · `src/db/schema/psychology.ts` · `drizzle/0013_psychology.sql`, `0014_psychology_rules.sql` · `src/features/psychology/` · `/psychology`, `/psychology/review`, `/psychology/:id` |

## 1. Concepts

Each concept (`psych_concepts`) is in one of 10 categories:

1. Consumer psychology
2. Cognitive biases
3. Persuasion
4. Influence
5. Decision-making
6. Negotiation psychology
7. Emotional intelligence
8. Trust building
9. Social dynamics
10. Behavioural economics

| Field | Column |
|---|---|
| Concept, category, explanation in your own words | `concept`, `category`, `explanation` |
| Source or book, author, link, source type | `source_title`, `source_author`, `source_url`, `source_type` (peer-reviewed paper, researcher's book, popular book, article, video, podcast, course, own observation) |
| Strength of evidence | `evidence_level` + `evidence_notes` (replications, criticism) |
| Practical example | `example` |
| Ethical considerations | `ethics` |
| Where I can apply it | `where_to_apply` |
| My observations | `observations` |
| Key takeaways | `takeaways` |
| Date learned | `learned_on` (cannot be in the future) |
| Spaced-repetition state | `sr_ease`, `sr_interval_days`, `sr_repetitions`, `sr_lapses`, `sr_due_on`, `last_reviewed_on`, `last_rating` |
| Understanding | `understanding`: new → learning → understood → understood deeply, or needs further study |

Reviews are stored in `psych_reviews` (rating, interval before and after). Real-world experiments are stored in `psych_applications`: context, what was tried, the result, and an outcome (worked, partly worked, did not work, inconclusive).

## 2. Evidence-based vs speculative

Every concept carries one of five evidence levels. The UI always shows the level as a colour-coded badge.

| Level | Meaning | Counts as evidence-based |
|---|---|---|
| Strong evidence | Replicated findings or meta-analyses | Yes |
| Moderate evidence | Peer-reviewed studies, not yet widely replicated | Yes |
| Limited or contested | Mixed results or failed replications | No |
| Practitioner experience | Experienced sellers report it; little formal research | No |
| Speculative / popular claim | Popular or internet claim without good evidence | No |

- Concepts that are not evidence-based show a warning on their page and in review: treat them as hypotheses and log experiments before relying on them.
- The lab overview reports how many concepts are evidence-based versus speculative.
- The evidence filter isolates either group.
- The form defaults to "Practitioner experience", not "Strong", so nothing is labelled as science by accident.

## 3. Spaced repetition

`scheduleReview` is a simplified SM-2 scheduler (pure, unit-tested):

| Rating | Effect |
|---|---|
| Forgot (again) | Streak resets to 0, lapse +1, due tomorrow, ease −0.2 (min 1.3) |
| Hard | Interval × 1.2, ease −0.15 |
| Good | 1 day, then 3 days, then interval × ease |
| Easy | 4 days on first success, then interval × ease × 1.3, ease +0.15 |

- A new concept is first due the day after it was learned.
- `/psychology/review` shows one due card at a time. You recall the concept first, then open "Show answer" (explanation, takeaways, where to apply it, ethics, evidence) and rate it.
- The first review moves a concept from New to Learning.
- Two lapses, or a "Forgot" rating, flag it as **needs further study**.

## 4. "Understood deeply" is earned

A concept can only be marked *understood deeply* after:

- **3 successful reviews** (hard, good or easy), and
- **at least one real application with a recorded result.**

The service enforces this (`canMarkDeep`). So does the database: a `psych_concepts_validate` trigger raises `deep_understanding_not_earned`, which the API returns as HTTP 422. The concept page lists the missing requirements. Reading about a concept, or reviewing it, is never treated as mastery.

## 5. Progress

The `/psychology` tiles and `GET /api/v1/psychology/stats` report:

- concepts learned (all time and the last 30 days)
- concepts reviewed and reviews in the last 30 days
- concepts applied and the number of experiments
- concepts understood deeply
- concepts needing further study
- the evidence mix
- reviews due today

## 6. REST API (`/api/v1/psychology`)

| Method | Path | Purpose |
|---|---|---|
| GET / POST | `/psychology/concepts?category=&evidence=&understanding=&q=` | List or filter / create a concept |
| GET / PATCH | `/psychology/concepts/:id` | Detail (concept, reviews, applications, deep check, needs-study flag) / update (incl. `understanding`, `archived`) |
| POST | `/psychology/concepts/:id/review` | `{ rating: "again" \| "hard" \| "good" \| "easy" }` |
| POST | `/psychology/concepts/:id/applications` | `{ context, action?, result?, outcome, appliedOn? }` |
| DELETE | `/psychology/applications/:id` | Remove an experiment |
| GET | `/psychology/review-queue` | Concepts due today |
| GET | `/psychology/stats` | Progress figures above |

All tables have row-level security: same-owner composite foreign keys, plus "no future date" triggers on `learned_on` and `applied_on`.

## 7. Tests

- **Unit** (`src/lib/domain/psychology.test.ts`): intervals grow on success and reset on failure; deep understanding must be earned through recall and real application.
- **Integration** (`tests/integration/psychology.test.ts`, real migrations under the RLS app role):
  - reviews are scheduled, and deep understanding is refused until earned, both in the service and by the DB trigger;
  - the needs-study flag and the progress figures are correct.
- **Browser** (Playwright):
  - create concepts at two evidence levels; the hypothesis warning appears only for the speculative one;
  - a deep-understanding attempt is refused with its reasons; log an experiment;
  - stats tiles, evidence filter, and a review that empties the due queue;
  - no horizontal overflow at 390 px.
