# 16. Product Development and Validation Tracker

| | |
|---|---|
| **Status** | Implemented (schema, DB rules, REST API, UI, tests) |
| **Code** | `src/lib/domain/product-validation.ts` · `src/db/schema/product-validation.ts` · `drizzle/0017_product_validation.sql`, `0018_product_validation_rules.sql` · `src/features/products/server/validation.ts` · `src/features/products/components/validation-tab.tsx` · `/products/:id?tab=validation` |

The goal is to stop spending months coding products nobody wants. Progress here is **validated demand**: what customers said and, above all, did. Hours spent coding are deliberately not tracked or rewarded.

## 1. The 12-step validation path

Every product has these steps (`product_validation_steps`, one row per product and step, created the first time a step is changed or given evidence):

1. Problem discovery
2. Customer interviews
3. Competitor research
4. Market validation
5. Landing page
6. Pre-sales or pilot customers
7. MVP development
8. Beta testing
9. Customer feedback
10. Public launch
11. Customer acquisition
12. Retention

How a step works:

- **Success criteria:** each step starts with editable criteria, e.g. "At least 3 customers commit before the product exists: pre-order, deposit, letter of intent or paid pilot."
- **Status:** not started, in progress, validated or invalidated. An invalidated step is a useful result: you learned the idea doesn't hold.
- **Evidence** (`product_validation_evidence`): date, kind, what you observed, an optional number and link. The kinds are observation, interview summary, document/link, metric, landing page visitors, sign-ups, pre-sale/pilot payment, survey and experiment. Counts, metrics and payments need a number.

Rules enforced by the database:

- A step can only be marked **validated or invalidated with at least one piece of evidence** (`evidence_required`). The decision date is set automatically and cleared if the step is reopened.
- The only evidence behind a decided step can't be deleted; reopen the step first. Cascading deletes (product, account) are still allowed.
- Evidence dates and interview dates cannot be in the future. Follow-up dates can.

The step after the last validated one is opened automatically on the page.

## 2. Customer interview log

`product_interviews` records:

| Field | Notes |
|---|---|
| Customer type (required), name/company, date | |
| Problem | In their words |
| Confirms the problem? | Yes / no / not asked |
| Pain 1–5 | |
| Current solution | What they do today and what it costs them |
| Willingness to pay | Would not pay · Unclear · Would consider · Said yes (no commitment) · **Committed** (pre-order, deposit, LOI) · **Paid**, plus the price they mentioned |
| Objections | |
| Feedback | |
| Follow-up date | Due and overdue follow-ups are flagged, with a "Followed up" button |

Only **committed** and **paid** count as willingness to pay. A verbal "yes" is shown separately and never counted. If 3 or more people said yes but none committed, the page tells you to ask for a deposit.

`interviewFollowUpsDue()` lists due follow-ups across all products, ready for the notifications work in Prompt 18.

Competitor research has its own list (`product_competitors`): name, link, pricing, strengths, weaknesses, and why customers would switch. Spreadsheets and doing nothing count as alternatives.

## 3. Validated demand

`demandEvidence()` (pure, unit-tested) climbs a ladder. Each level requires the ones before it:

| Level | Name | Requirement |
|---|---|---|
| 0 | No evidence yet | |
| 1 | Problem heard | ≥ 5 interviews, ≥ 60 % of those asked confirm the problem |
| 2 | Problem confirmed | ≥ 10 interviews, ≥ 60 % confirm |
| 3 | Willingness to pay | ≥ 3 commitments (committed/paid interviews + pre-sale payments) |
| 4 | Paying customers | ≥ 3 paying customers (pre-sale payments or recorded active customers) |
| 5 | Retained customers | Monthly churn below 8 % for 3 recorded months |

Also shown:

- interviews and the share confirming the problem
- commitments vs verbal yeses, and the median price mentioned
- landing-page conversion (sign-ups ÷ visitors, from evidence)
- pre-sale count and amount
- steps validated or invalidated
- follow-ups due

Warnings:

- You're at MVP or later with demand below level 3 ("building before anyone has committed to pay").
- There are verbal yeses but no commitments.
- "Customer interviews" is marked validated with fewer than 10 logged.

## 4. The MVP gate

Moving a product from Idea, Research or Validation to **MVP or any later stage** while demand is below level 3 is refused with `409 validation_required`. To go ahead anyway, tick the acknowledgement (`acknowledgeUnvalidated: true`) **and** give a reason in the status note, which is then kept on the product. Products created directly at a later stage (e.g. one already selling) are not gated.

## 5. Portfolio integration

Demand evidence feeds the portfolio recommendation for products that haven't launched ([docs/15](15-product-portfolio.md)):

- **Level ≥ 3** (customers committed) → **Invest more**: build what they committed to.
- **No one willing to pay yet** → **Validate before building more**, with the counts.
- **≥ 6 months in a stage with no feedback or interviews** → **Consider pausing**.

Each pre-launch product's card in the portfolio shows its demand level, interviews and commitments.

## 6. REST API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/products/:id/validation` | Steps (with defaults for untouched steps) and their evidence, interviews (with `followUpDue`), competitors, demand evidence |
| PATCH | `/api/v1/products/:id/validation/steps/:step` | `{ status?, successCriteria?, notes? }`. Validated or invalidated needs evidence. |
| POST / PATCH / DELETE | `/api/v1/products/:id/{interviews,competitors,evidence}[/:itemId]` | Same collection routes as the portfolio |
| PATCH | `/api/v1/products/:id` | `stage` changes subject to the MVP gate; `acknowledgeUnvalidated` + `statusNote` to override |

Reads never write: steps that have no row yet come back with their default criteria.

## 7. Fix to all forms: input survives a failed save

React 19 resets uncontrolled form fields after every resolved form action, including one that returned a validation error. So anyone who hit an error lost what they had typed. `ActionForm` now submits through a transition and resets only on success. It keeps the `action` attribute, so forms still work before hydration.

## 8. Tests

- **Unit** (`product-validation.test.ts`):
  - the ladder, and verbal yeses not counting
  - levels must be reached in order
  - landing conversion and retention
  - warnings and the MVP gate
- **Unit** (`products.test.ts`): invest on commitment; validate when no one will pay.
- **Integration** (`tests/integration/product-validation.test.ts`, real migrations under the RLS app role):
  - 12 steps with default criteria
  - evidence required to decide a step, and the decision date
  - the last-evidence guard, and reopening the step
  - value required for counts; future dates rejected
  - interview logging and follow-ups due across products
  - demand level 2 → 3 from pre-sales and a commitment
  - the MVP gate with verbal yeses, then opened by commitments
  - the portfolio recommendation; PATCH keeping fields
  - cascade delete through decided steps
- **Integration** (`products.test.ts`): the gate on Idea → Launch needs an acknowledgement and a reason.
- **Browser** (Playwright):
  - validating without evidence is refused inline; add evidence, then validate
  - log interviews; mark a follow-up done
  - the stage gate: refused, then reason required, then accepted
  - the building-without-commitment warning; the portfolio demand line
  - no overflow at 390 px
  - re-ran the Today, Week, Sales, Communication, Psychology and Products browser suites after the form change
