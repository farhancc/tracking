# 15. Software Product Portfolio Manager

| | |
|---|---|
| **Status** | Implemented (schema, DB rules, REST API, UI, tests) |
| **Code** | `src/lib/domain/products.ts` · `src/db/schema/products.ts` · `drizzle/0015_products.sql`, `0016_products_rules.sql` · `src/features/products/` · `/products`, `/products/:id?tab=overview\|finance\|build\|feedback` |

Products are their own entity, separate from personal learning goals. A product can optionally say which strategic goal it contributes to (`goal_id`), but its progress is never mixed into goal progress.

## 1. Product fields

| Requirement | Where |
|---|---|
| Product name, description | `products.name` (unique per owner), `description` |
| Target customer, problem being solved, value proposition | `target_customer`, `problem`, `value_proposition` |
| Business model, pricing | `business_model` (subscription, one-time, usage-based, freemium, marketplace, services, advertising, other), `pricing` (free text, e.g. "$49/month or $490/year") |
| Development stage | `stage`: Idea → Research → Validation → MVP → Beta → Launch → Growth → Optimization. Every change is recorded in `product_stage_events`, and the stage clock (`stage_entered_on`) restarts. |
| Launch date | `planned_launch_on` (**forecast**) and `launched_on` (**actual**, never in the future). Launch, Growth and Optimization require an actual launch date. Moving into Launch records today unless you give a date. |
| Monthly recurring revenue, active customers, churn | `product_metrics`: one row per product per month (MRR, active customers at month end, new, lost). Recording a month again corrects it. |
| Total revenue, expenses, profit | Computed from the `product_transactions` ledger (revenue: subscriptions, one-time, services, other; refunds are subtracted; expenses: hosting, software, marketing, contractors, payment fees, legal, hardware, other). They are never typed in as totals. |
| Customer acquisition channels | `acquisition_channels text[]` |
| Status | `status`: active, paused or discontinued, separate from the stage, plus an optional `status_note` |
| Currency | `currency` (defaults to the profile's base currency). Locked once revenue, expenses or MRR are recorded (`currency_locked`). |

### Metric definitions

- **MRR** is the latest recorded month, always shown with its month ("MRR · Oct 2026").
- **Churn** (monthly, logo) = customers lost ÷ customers at the start of the month. Start = end − new + lost. It shows "—" when there were no customers at the start.
- **Total revenue** = revenue − refunds (lifetime).
- **Profit** = net revenue − expenses.
- **Last 3 months** = the three complete calendar months before the current one.

Money is never added across currencies. The portfolio shows one set of totals per currency.

## 2. Milestones, backlog, feedback, bugs and releases

| Table | Fields | Rules |
|---|---|---|
| `product_milestones` | title, stage, due date, status (open/done/dropped) | Done ⇔ `completed_on` set (defaults to today, never in the future). Open milestones past their due date show "Overdue". |
| `product_releases` | version (unique per product), title, notes, `planned_on` (forecast), `released_on` (actual) | "Released today" button. Deleting a release unlinks its features and bugs. |
| `product_features` | title, description, status (backlog → planned → in progress → shipped / dropped), MoSCoW priority, impact and effort 1–5, release | Shipped ⇔ `shipped_on` set (the release's date, else today). The release must belong to the same product (composite FK). |
| `product_feedback` | date, customer, source (interview, call, email, support, in-app, review, social, other), type (praise, complaint, feature request, bug report, question, reason for leaving), sentiment, what they said, related feature | Feature requests linked to a feature are counted on it ("3 requests"). |
| `product_bugs` | title, details, severity (critical/high/medium/low), status (open, in progress, fixed, won't fix), reported date, fixed date, fixed-in release | Fixed ⇔ `fixed_on` set. Open critical bugs are mentioned in the recommendation. |

All dates that record something that happened (started, launched, transaction, completed, released, shipped, feedback received, reported, fixed) are rejected if they are in the future. A generic trigger, `app.no_future_dates(cols…)`, checks this. Monthly metrics may not describe a month that hasn't started.

## 3. Separate revenue and expense reports

The **Revenue & expenses** tab (and `GET /api/v1/products/:id/report?from=&to=`) shows, for one product and any date range:

- totals: revenue, refunds, net revenue, expenses, profit
- a monthly chart: net revenue and expenses as bars, profit as a line, all on one money axis
- a monthly table: revenue, refunds, expenses, profit, cumulative profit (including earlier history); the current month is marked "to date"
- revenue by category and expenses by category
- the ledger, with deletion

The default range is the last 12 months, or from the start date if that is later.

The chart colours are validated categorical tokens, `--chart-1` (blue) and `--chart-2` (orange), with separate light and dark steps. They passed the dataviz palette validator for lightness, chroma, colour-blind separation and contrast. The table carries the same figures as the chart, so the chart is not the only way to read them.

## 4. Portfolio overview: where to invest

`/products` lists every product with:

- stage
- MRR (with its month), customers and churn
- profit for the last 3 months and lifetime
- a **recommendation**, its reasons, and a confidence level

Products that need a decision are listed first. The recommendation comes from fixed rules (`assessProduct`, unit-tested) applied only to recorded data:

| Product | Rule | Recommendation |
|---|---|---|
| Paused / discontinued | Your status | Paused / Discontinued |
| Not launched (Idea…Beta) | ≥ 6 months in the current stage and no feedback or interviews in 90 days | **Consider pausing** |
| Not launched | Otherwise: judged on validation evidence, not revenue | **Validate before building more** |
| Launched | < 2 months of metrics | **Not enough data** |
| Launched | MRR fell in each recent month **and** last 3 months lost money **and** launched ≥ 6 months ago | **Consider discontinuing** |
| Launched | Average churn > 8 %/month | **Fix retention first** |
| Launched | Growth ≤ 0 and last 3 months lost money | **Consider pausing** |
| Launched | Average MRR growth ≥ 5 %/month | **Invest more** |
| Launched | Otherwise | **Maintain** |

- **Growth** is the average month-over-month MRR change across up to the last three consecutive recorded months.
- **Confidence** is high with ≥ 6 months of metrics, medium with ≥ 3, and low otherwise.
- The reasons always state the figures used.

The recommendation is a prompt for a decision. The app never pauses or discontinues a product by itself: that is a status change you make.

Prompt 10 (validation tracker) feeds validation evidence into the "not launched" rules through `AssessmentInput.validation`.

## 5. REST API (`/api/v1/products`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/products?includeArchived=` | Portfolio: items (product, lifetime/recent/last-month finance, latest metrics, assessment) and per-currency totals |
| POST | `/products` | Create a product |
| GET / PATCH | `/products/:id` | Detail (figures, assessment, stage history, metrics, milestones, releases, features with request counts, feedback, bugs) / update (incl. `stage`, `status`, `archived`) |
| GET | `/products/:id/report?from=&to=` | Revenue and expense report |
| POST | `/products/:id/:collection` | Add to `metrics` (upsert by month), `transactions`, `milestones`, `releases`, `features`, `feedback` or `bugs` |
| PATCH / DELETE | `/products/:id/:collection/:itemId` | Update or delete an item |

## 6. Fix to existing modules: patches no longer reset fields

Zod 4 applies `.default()` values even to keys that `.partial()` made optional. So a `PATCH` that left a defaulted field out silently reset it. For example:

- changing a deal's title reset its stage
- recording a KPI actual reset its unit and direction
- changing a risk's status reset its likelihood and impact

All update schemas now use `patchOf()` (`src/lib/validation.ts`), which drops defaults. A unit test fails if any exported update schema still carries one.

## 7. Tests

- **Unit** (`src/lib/domain/products.test.ts`):
  - finance netting, empty months and the running total
  - churn from start-of-month customers
  - growth only across consecutive months
  - every recommendation branch
- **Unit** (`src/lib/validation.test.ts`): `patchOf`, plus the guard over all update schemas.
- **Integration** (`tests/integration/products.test.ts`, real migrations under the RLS app role):
  - launched-stage date rule, stage history, launch date defaulting to today
  - currency lock, owner isolation
  - ledger report figures
  - future-dated entry and future-month rejection, monthly metric upsert
  - portfolio assessment and per-currency totals
  - milestone, feature and bug status dates
  - a cross-product release rejected
  - a PATCH keeps unspecified fields
  - feedback request counts; release and feature deletion unlinks children
- **Browser** (Playwright):
  - portfolio ordering and recommendations; create a product
  - complete a milestone; move to Launch
  - record revenue, an expense and a month of metrics; a future entry is rejected
  - add a release, a shipped feature and a fixed bug; link feedback to a feature
  - chart tooltip
  - no horizontal overflow at 390 px on every tab
