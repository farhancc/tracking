# 21. Financial Independence Dashboard

| | |
|---|---|
| **Status** | Implemented (schema, DB rules, REST API, UI, tests) |
| **Code** | `src/lib/domain/finance.ts` · `src/db/schema/finance.ts` · `drizzle/0027_finance.sql`, `0028_finance_rules.sql` · `src/features/finance/` · `/finance` (Build → Finance) |

## 1. Actuals, forecasts and projections

| Kind | Where | Rule |
|---|---|---|
| **Actual** | Income entries, expense entries, account balances, and the product ledger (docs/15) | Dates can't be in the future (DB trigger). Every headline figure comes from these. |
| **Forecast** | `finance_forecasts`: expected income or spending for a month | Shown in its own "Forecast vs actual" table, in italics, next to the actual figure. Never added to actuals. |
| **Projection** | Computed: the date investable assets would reach the FI target | Boxed and labelled "Projection", with its assumptions (saving rate and return) stated next to it. |

One currency is used for everything (`finance_settings.currency`, defaulting to your base currency). Products in another currency are **left out and named**, never converted.

## 2. What is tracked

| Requirement | How |
|---|---|
| Monthly salary, business revenue, course revenue, consulting income | `finance_income` (source, amount, date, recurring flag, note) |
| Product revenue | **From the product ledger** (net of refunds), so it is recorded once |
| Expenses | `finance_expenses` (category, amount, date, essential flag defaulting by category, note). Product costs from the ledger count as business expenses too. |
| Debt, savings, investments, emergency fund | `finance_accounts` (cash, savings, emergency fund, investment, retirement, property, other asset; loan, credit card, mortgage, other debt; optional interest rate) with dated `finance_balances` (one per account per day; debts entered as the amount owed) |
| Net worth | Latest balance of every asset − latest balance of every debt |

## 3. Calculations

| Figure | Definition |
|---|---|
| Monthly savings rate | (income − spending) ÷ income for the month. Shown for last month and the last 3 months combined. |
| Total debt outstanding | Sum of the latest debt balances |
| Monthly recurring business income | Latest recorded MRR of active products (same currency) + recurring business income (non-salary) last month |
| Annual income | All income over the last 12 complete months |
| Business profit | Business income (business, product, course, consulting) − business expenses (product costs + "business" category), last 12 months and per month |
| Net worth | As above, as of the latest balance date |
| Essential monthly expenses | Average essential spending over the last 3 complete months |
| Financial independence target | **Annual expenses ÷ withdrawal rate** |

For the FI target:

- **Annual expenses** is your own estimate if you set one, otherwise the last 3 months' average spending × 12. The source is always shown.
- **Withdrawal rate** is configurable (default 4 %) and labelled as an assumption.
- Progress counts investable assets (savings, investments, retirement) against the target.

The **projection** simulates monthly saving (the 3-month average) at an expected yearly return (configurable, default 5 %) until the target is reached. If the target can't be reached within 100 years, it says so.

Months are calendar months in your timezone. The current month is shown "to date" and isn't used in averages.

## 4. Milestones

Each milestone is computed from recorded data only and shows the date it first happened, or where things stand now.

| Milestone | Reached when |
|---|---|
| Debt cleared | Debt had been recorded, and on a balance date every debt account is at zero, and it still is |
| Emergency fund completed | The emergency-fund balance first reaches N months (default 6) of essential expenses |
| First profitable product | The first month a product's ledger shows revenue above its costs |
| First recurring business income | The first month with product MRR above zero, or recurring business income |
| First month exceeding salary through business | Business income > salary in a month (and above zero) |
| Twelve months of independent business income | 12 months in a row where business profit covered all personal spending |

## 5. REST API (`/api/v1/finance`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/finance` | Monthly actuals, position, summary, recurring business income, FI target, progress and projection with assumptions, milestones, forecast-vs-actual, excluded products, recent entries |
| PATCH | `/finance/settings` | `{ currency?, withdrawalRatePct?, annualExpensesEstimate?, expectedReturnPct?, emergencyMonths? }` |
| POST · DELETE | `/finance/income` · `/finance/income/:id` | `{ source, amount, receivedOn?, recurring?, description? }` |
| POST · DELETE | `/finance/expenses` · `/finance/expenses/:id` | `{ category, amount, spentOn?, essential?, description? }` |
| POST · DELETE | `/finance/accounts` · `/finance/accounts/:id` | Create (optional opening balance) / archive |
| POST · DELETE | `/finance/accounts/:id/balances` · `/finance/balances/:id` | `{ balance, asOf? }` |
| POST · DELETE | `/finance/forecasts` · `/finance/forecasts/:id` | `{ month, kind, label, amount, source? }` |

## 6. Tests

- **Unit** (`finance.test.ts`):
  - monthly actuals with product ledger figures, business profit and recurring income
  - savings rate; position and net worth over time
  - the FI target; reachable and unreachable projections
  - all six milestones; debt cleared only if it stays cleared
- **Integration** (`tests/integration/finance.test.ts`, real migrations under the RLS app role):
  - entries and essential defaults; future dates rejected
  - product revenue from the ledger, with an other-currency product left out
  - balances, net worth and debt; recurring business income from MRR plus a retainer
  - the derived FI target, then your own estimate and withdrawal rate
  - forecasts kept out of actuals
  - milestones; owner isolation
- **Browser** (Playwright):
  - tiles, FI target and projection, milestones
  - an expense recorded; a future-dated one refused with the amount kept
  - changing the withdrawal rate updates the target
  - paying off the loan marks "Debt cleared"
  - no overflow at 390 px
