# 12. Sales Mastery Tracker

| | |
|---|---|
| **Status** | Implemented (schema, rules, REST API, UI, tests) |
| **Code** | `src/lib/domain/sales.ts` · `src/db/schema/sales.ts` · `drizzle/0009_sales.sql`, `0010_sales_rules.sql` · `src/features/sales/` · `src/app/api/v1/sales/` · `/sales`, `/sales/journal` |

## 1. Model

| Concept | Table | Notes |
|---|---|---|
| **Sales track** | `sales_tracks` | A selling context with its own **currency and targets**, e.g. *Employer – CloudCo (USD)*, *FiveYearOS workshops (INR)*. A default track in your base currency is created on first use. |
| **Prospect** | `prospects` | Name, company, role, source, next follow-up and status. Status moves **forward only** from activity (new → contacted → connected → qualified → meeting → proposal → won). |
| **Activity** | `sales_activities` | One row per real-world action: prospecting attempt, cold call, follow-up, meeting or quotation. Each records its outcome flags: connected (picked up / replied), decision-maker reached, qualified, meeting booked. These are a ladder, enforced by a check constraint. |
| **Deal** | `deals` | Stage qualified → meeting → proposal → negotiation → won / lost, with amount and currency. A quotation attaches to the prospect's open deal (or opens one). *Won* needs an amount. Closing sets the close date (never in the future). |
| **Target** | `sales_targets` | Per track × metric × period (day/week/month/quarter), **effective-dated**: raising a target later never changes how earlier periods are judged |
| **Learning journal** | `sales_journal_entries` | Difficult objections, successful responses (did it work?), rejected prospects, successful conversations, mistakes, lessons, with tags and full-text search |

Activities and journal entries can't be dated in the future (owner's timezone).

## 2. Metrics

**Counts per period:** prospecting attempts (outreach + cold calls), cold calls, calls connected, decision-makers reached, qualified leads, follow-ups, meetings booked, quotations sent, deals closed (won), revenue (per currency), lost deals.

| Rate | Formula |
|---|---|
| Connection rate | calls connected ÷ cold calls |
| Qualification rate | qualified leads ÷ decision-makers reached |
| Meeting conversion | meetings booked ÷ qualified leads |
| Proposal conversion | deals won ÷ quotations sent |
| Closing rate | deals won ÷ (won + lost) |
| Average deal value | revenue ÷ deals won (per currency) |
| Revenue per prospect | revenue ÷ prospecting attempts (per currency) |
| Follow-up effectiveness | follow-ups that got a response ÷ follow-ups |

Currencies are never mixed. "All tracks" shows revenue per currency; a single track shows revenue against its own target.

## 3. Dashboard (`/sales`)

- **Day / week / month / quarter** views (calendar periods), with previous and next navigation and a track filter.
- **One-tap logging:** five call-outcome buttons, where each outcome includes the steps before it. There are also outreach sent/replied and follow-up with or without reply. A detailed form covers prospect, quotation amount, meeting and past date.
- **Activity and results:** all eleven counts with target bars ("limit" for lost deals) and the previous period.
- **Conversion rates:** each rate with its formula and the change in percentage points vs the previous period.
- **Trend:** the four main rates over the last 8 periods, plus cold-call volume. Tracking performance trends rather than totals is the point.
- **Open deals:**
  - stage moves, and closing as won or lost with a reason;
  - the open pipeline value.
- **Prospects:**
  - status and next follow-up, with won, lost and disqualified prospects excluded from "due";
  - adding a prospect.
- **Recent activity** (deletable), and **targets and tracks**.

## 4. REST API (`/api/v1/sales`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/dashboard?period=&anchor=&trackId=` | Counts vs targets, rates, previous-period rates, 8-period trend, deals, follow-ups, recent activity |
| GET / POST | `/tracks` · PATCH `/tracks/:id` | Tracks (`isDefault`, `archived`) |
| GET / POST | `/activities` · DELETE `/activities/:id` | `{ kind, outcome?, connected?, reachedDecisionMaker?, qualified?, meetingBooked?, amount?, currency?, prospectId?, dealId?, trackId?, channel?, occurredOn?, notes? }` |
| GET / POST | `/prospects` · PATCH `/prospects/:id` | Prospects (`archived`) |
| GET / POST | `/deals` · PATCH `/deals/:id` | Deals, including stage changes and closing |
| GET / PUT | `/targets` | `{ trackId, metric, period, targetValue \| null, effectiveFrom? }` |
| GET / POST | `/journal?kind=&q=&tag=` · PATCH / DELETE `/journal/:id` | Learning journal |

## 5. Tests

- **`src/lib/domain/sales.test.ts` (4 tests):**
  - calendar periods and shifting;
  - the full funnel and every rate on a known data set;
  - separate currencies and empty periods;
  - target attainment, including limits;
  - forward-only prospect status.
- **`tests/integration/sales.test.ts` (4 tests):**
  - the outcome ladder and weekly rates, with the database check and the no-future rule;
  - a quotation opening a deal, or attaching to the prospect's open deal and moving it to "proposal";
  - won/lost, closing rate, average deal value and revenue per prospect;
  - "won without amount" and future closes rejected;
  - effective-dated targets per track, and INR and USD kept separate;
  - journal search by text, tag and kind.
