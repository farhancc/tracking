# 17. Personal Branding and Content Management

| | |
|---|---|
| **Status** | Implemented (schema, DB rules, REST API, UI, tests) |
| **Code** | `src/lib/domain/content.ts` · `src/db/schema/content.ts` · `drizzle/0019_content.sql`, `0020_content_rules.sql` · `src/features/content/` · `/content`, `/content/ideas`, `/content/calendar`, `/content/:id` |

## 1. Positioning and pillars

- **Positioning** (`brand_settings`) starts with the statement from the plan: *"I build technology products, study communication and sales psychology, and share practical lessons about selling, persuasion and human behaviour."* It is shown at the top of `/content` and can be edited, along with a target audience.
- **Content pillars** (`content_pillars`) start with the seven from the plan:
  - Communication
  - Sales psychology
  - Persuasion and negotiation
  - Human behaviour
  - Practical sales
  - Entrepreneurship
  - Technology and product building

  They can be renamed, archived and added to. An archived pillar stays on the items that use it.

Both are created on first visit and only once, like the communication skills.

## 2. Content items

| Requirement | Column |
|---|---|
| Title, topic | `title`, `topic` |
| Content pillar | `pillar_id` (same-owner FK) |
| Platform | `platform`: Instagram, YouTube or LinkedIn |
| Format | `format`, which must fit the platform (DB check): Instagram reel/carousel/photo post/story/live · YouTube long-form/short/live · LinkedIn text post/document/video/article/newsletter |
| Script | `hook` + `script` |
| Research sources | `content_sources`: title, link, what it supports |
| Recording date | `planned_record_on` (**plan**) and `recorded_on` (**actual**, never in the future) |
| Publishing date | `scheduled_on` (**plan**) and `published_on` (**actual**, never in the future), plus `published_url` |
| Status | the pipeline below |
| Views, reach, engagement, shares, saves, comments, leads generated | `content_metrics` snapshots (§4) |

Items can be **repurposed**: "Create version" makes a copy for another platform at the Script stage, with the same hook, script and sources, linked through `repurposed_from_id`. Items are archived rather than deleted.

## 3. Pipeline

Idea → Research → Script → Recording → Editing → Scheduled → Published → Performance Review

| Rule | Where |
|---|---|
| From **Script** on, the item needs a platform and format | service + DB check |
| Moving past **Recording** sets `recorded_on` to today if missing | service |
| **Scheduled** needs a scheduled date | service + DB check |
| **Published** sets `published_on` (default today, never in the future); moving back before Published clears it | service + DB check + trigger |
| Content with recorded metrics can't be moved back before Published (`metrics_exist`) | trigger |
| **Performance review** needs at least one metrics snapshot (`metrics_required`) and a written lesson (`review_notes`) | trigger + DB check |

Each card and item page has a one-tap "→ next stage" button. If a rule blocks the move, the error appears inline.

The pipeline board (`/content`) shows:

- the eight stages as columns (scrolling sideways on a phone)
- one-line idea capture
- warnings for overdue scheduled items and items published over a week ago without a review
- the pillar mix: published in the last 90 days vs in production
- the next 14 days
- editors for the positioning and pillars

The **idea library** (`/content/ideas`) lists Idea and Research items, with a pillar filter, search and quick capture.

The **content calendar** (`/content/calendar?month=YYYY-MM`) is a month grid on wider screens and a day-by-day agenda on phones. It shows:

- published (actual, solid)
- scheduled (plan, dashed)
- planned recordings that haven't happened yet

## 4. Metrics

`content_metrics` stores dated snapshots copied from each platform's insights. The counts are cumulative, so the latest snapshot is the current figure. Capturing the same date again corrects it.

Fields:

- views, reach, impressions
- likes, comments, shares, saves
- watch time, average view duration, average retention %, completion rate %
- profile visits, followers gained, website clicks
- leads, sales attributed (count and amount)

The form only asks for the fields that platform reports (`METRICS_BY_PLATFORM`); YouTube, for example, has no saves.

Rules:

- Metrics are rejected for unpublished items (`not_published`).
- They are rejected if captured before the publish date (`captured_before_publish`) or in the future.
- Percentages are 0–100, counts ≥ 0.
- A snapshot needs at least one number.

**Engagement** is calculated, never typed in: likes + comments + shares + saves, from what was recorded. **Engagement rate** is engagement ÷ reach, falling back to views and then impressions, and the base used is always shown ("7.8 % of views").

The analytics across content (best pillar, format, trends, leads and trust) are in Prompt 12.

## 5. REST API (`/api/v1/content`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/content` | Overview: positioning, pillars, items, counts per stage, pillar mix, upcoming, overdue, awaiting review |
| GET / PUT | `/content/brand` | Positioning and audience |
| GET / POST · PATCH | `/content/pillars` · `/content/pillars/:id` | Pillars (`archived` to archive) |
| GET / POST | `/content/items?status=&pillarId=&platform=&q=&ideas=true` | List with latest metrics / create |
| GET / PATCH | `/content/items/:id` | Detail (sources, snapshots, latest with computed engagement, versions, original) / update with the pipeline rules |
| POST | `/content/items/:id/advance` | Next stage |
| POST | `/content/items/:id/repurpose` | `{ platform, format, title? }` |
| POST · DELETE | `/content/items/:id/sources` · `/content/sources/:id` | Research sources |
| POST · DELETE | `/content/items/:id/metrics` · `/content/metrics/:id` | Snapshots (upsert by `capturedOn`) |
| GET | `/content/calendar?month=YYYY-MM` | Calendar entries |

## 6. Tests

- **Unit** (`src/lib/domain/content.test.ts`):
  - pipeline order and platform formats
  - engagement and rate with the named base
  - latest snapshot
  - the Monday-first month grid
- **Integration** (`tests/integration/content.test.ts`, real migrations under the RLS app role):
  - seeded positioning and pillars (idempotent) and editing them
  - an item from Idea to Performance review: platform required at Script, a wrong format rejected, recorded date set
  - scheduling needs a date; the calendar entry
  - metrics need a published item; a future publish date is rejected; capture before publish is rejected; an empty snapshot is rejected
  - same-day upsert; computed engagement rate
  - un-publishing blocked once metrics exist; the review needs metrics and a lesson
  - repurposing copies the script and sources
  - overview counts and pillar mix; owner isolation
- **Browser** (Playwright):
  - the pipeline board and warnings; quick idea capture; advancing from a card
  - an inline refusal without a platform; setting the platform, format and script; stepping through stages
  - scheduling needs a date, and the chosen status is kept after the error
  - publishing; YouTube-specific metric fields; computed engagement
  - the review needs a lesson; repurposing to LinkedIn
  - the idea library; the calendar grid and the phone agenda
  - no overflow at 390 px
