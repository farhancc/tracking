# 25. Analytics, reports and five-year progress

| | |
|---|---|
| **Status** | Implemented and tested: `/analytics` with 11 sections, time filters, monthly reports, planned vs actual, an activity-vs-outcome reading, and CSV and PDF export. |
| **Code** | `src/lib/domain/analytics.ts` (ranges, buckets, rebuilding goal progress, verdicts, CSV) · `src/features/analytics/server/{service,export,queries}.ts` · `src/features/analytics/components/*` · `/analytics` (Plan → Analytics) · `GET /api/v1/analytics`, `GET /api/v1/analytics/export` |
| **Dependency** | `pdf-lib` 1.17.1: pure JavaScript, no native binaries or headless browser, so it runs on serverless hosts. |

## 1. Principles

- **Actuals come only from recorded data.** Nothing is estimated or filled in. A section with nothing recorded says "No data recorded in this period."
- **Planned means something you set**, and the source is named:

  | Section | "Planned" is |
  |---|---|
  | Five-year, annual, quarterly | Linear pace: the share of the goal's period elapsed |
  | Weekly completion | Tasks planned for the week; weekly goals set |
  | Sales | Your targets, spread evenly over each period (a weekly target of 14 is 2 a day) |
  | Content | Items scheduled in the period |
  | Finance | Your monthly income and expense forecasts |
  | Habits | Every expected check-in (100 %) |

  Where nothing was set (product revenue, customers, communication practice), planned is shown as "–" rather than invented.
- **Forecasts never mix with actuals.** Finance shows them in separate columns.
- **Currencies are never converted.**
  - Product and sales revenue use your base currency.
  - Other currencies are listed in a note.
  - Finance uses the finance currency.

## 2. Time filters

| Filter | Range | Buckets |
|---|---|---|
| 7 days | today − 6 … today | Days |
| 30 days | today − 29 … today | Weeks (first and last clipped) |
| 90 days | today − 89 … today | Weeks |
| 1 year | today − 364 … today | Months (clipped) |
| Five-year journey | journey start … today (or journey end) | Months |
| **Monthly report** (`?month=YYYY-MM`, API `range=month:YYYY-MM`) | That calendar month, up to today | Weeks |

- Weeks start on your week-start day.
- Every range has a **previous period** of the same length, used by the activity-vs-outcome reading.
- Customer and finance figures are recorded monthly, so those sections always use months. A month only partly inside the range counts in full (the note says so).

## 3. Sections

1. **Five-year progress.**
   - Average outcome progress of the five-year goals against planned pace, plus journey elapsed and goals on track.
   - The line is **rebuilt for each date from logged measurements**, using the database's own rules (latest value, cumulative sum, or the average of key results), so it shows where each goal stood on that date. A test checks that the rebuilt value for today equals the stored `completion_pct`.
2. **Annual objectives.** Set vs achieved per year, open and on pace, and missed. An objective counts as achieved only once you confirm it.
3. **Quarterly key results.** Average progress vs pace per quarter and key results met, as of the end of the range.
4. **Weekly completion.** Planned tasks vs done per period, completion rate, weekly goals met (the outcome), and deliverables.
5. **Sales performance.**
   - Prospecting attempts, cold calls, meetings, deals won and revenue, each against its target where one exists.
   - Closing rate.
   - The chart shows the activity you set a target for; a per-period funnel table.
6. **Communication skills.**
   - Practice minutes, and assessed level at the start and end of the range per skill against target.
   - Levels come only from assessments.
7. **Product revenue.** Net revenue (refunds subtracted) and expenses by period, and MRR at each period end.
8. **Customer acquisition.** New and churned product customers per month, active at month end, and sales deals won.
9. **Content growth.**
   - Scheduled vs published.
   - Followers: the sum of the latest snapshot per platform.
   - Leads from pieces published in the range.
10. **Financial independence.**
    - FI progress = investable assets ÷ FI target. The target is annual expenses ÷ your withdrawal rate, using the same rule as the finance dashboard.
    - Investable change; income and expenses vs forecasts; savings rate.
    - Net worth by month.
11. **Habit consistency.** Done ÷ expected check-ins per period and per habit. Rest days are excused.

## 4. Is activity turning into outcomes?

Six pairs, each compared with the previous period of the same length:

| Area | Activity | Outcome |
|---|---|---|
| Execution | Tasks completed | Five-year progress gained (points, rebuilt from measurements) |
| Sales | Prospecting attempts + follow-ups | Meetings booked |
| Sales | Quotations sent | Deals won |
| Content | Pieces published | Leads from those pieces |
| Communication | Practice minutes | Assessed level points gained |
| Products | Features shipped + releases | New customers |

The reading (`judge()`) is rule-based. It compares **outcome per unit of activity** with the previous period:

| Situation | Reading |
|---|---|
| Neither activity nor outcome | No data |
| Activity, no outcome | Activity without a measurable outcome (flagged) |
| Outcome, no activity | Outcome may come from earlier work |
| Both, but the previous period had no conversion to compare | Producing outcomes; nothing to compare against |
| Conversion up ≥ 10 % | More outcome per unit of activity |
| Conversion down ≥ 10 % | More effort per result (flagged) |
| Otherwise | About the same |

The page and the PDF both state that this shows whether effort and results move together. It does not prove cause, and outcomes can lag their activity.

## 5. Export

- **CSV:** `GET /api/v1/analytics/export?range=…&format=csv`.
  - One tidy table with columns `section, kind, metric, period, planned, actual, unit`.
  - `kind` is one of kpi, series, table, activity, outcome or verdict.
  - UTF-8 with a BOM so Excel opens it correctly.
  - Text cells that start with `= + - @` are prefixed with `'`, which prevents formula injection.
- **PDF:** `format=pdf`. An A4 report built from the same data as the page:
  - the activity-vs-outcome table first;
  - then each section's planned/actual table, a small chart, and its detail table (first 40 rows; the rest are in the CSV);
  - notes on every section.
  - Standard PDF fonts cover Windows-1252 only, so symbols are mapped (–, →, ≥) and currencies are written as codes (INR 46,800).
- Both downloads are `attachment` and `no-store`, and are generated for the signed-in user only (RLS).
- The **Monthly report** picker on the page plus **PDF** produces a monthly report.

## 6. Charts

- Recharts, one y-axis per chart, no animation.
- **Planned** is always neutral grey (dashed when shown as a line). **Actual** series use the validated `--chart-1/2/3` hues in fixed order.
- Legend and tooltip text use text colours.
- Every chart has a table (under "Table") and an `aria-label`.
- FI progress is charted as a percentage of the target, because the target can be many times the current assets.

## 7. Tests

- **Unit** (`src/lib/domain/analytics.test.ts`):
  - every range, including clipping, the previous period and monthly reports;
  - buckets that cover the range with no gaps or overlaps;
  - rebuilt progress for latest, cumulative and key-result goals, with archived key results left out;
  - proration and percentage change;
  - every reading in `judge()`;
  - CSV escaping and formula-injection guarding.
- **Integration** (`tests/integration/analytics.test.ts`, real Postgres and RLS):
  - rebuilt five-year progress equals the stored value today and the correct value 21 days ago;
  - sales counts by period against a prorated weekly target, for both 7d and 90d;
  - calls without meetings are flagged;
  - every range and the monthly report run;
  - an empty account shows no data and no other user's goals;
  - the CSV header and rows are correct, and the PDF is a valid `%PDF-` file.
- **Browser** (`next build && next start`, Playwright, 390 × 844 and 1280 × 900, seeded data):
  - page loads with charts; range links and the monthly picker work;
  - axe reports no violations; no horizontal scroll;
  - CSV and PDF downloads have the right file names;
  - the PDF was rendered to images and checked by eye.
- **API:** every range returned 200 in under 100 ms on the seeded data, and an invalid range returns 400.

## 8. Limits

- Monthly-recorded figures (customers, finance) count whole months.
- Goal progress before your first measurement is the baseline, which may understate work done before you began logging.
- "Before" comparisons need data in the previous period; for a new account most readings say there is nothing to compare.
