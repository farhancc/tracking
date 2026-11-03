# 18. Content Performance Analytics

| | |
|---|---|
| **Status** | Implemented (schema, REST API, UI, tests) |
| **Code** | `src/lib/domain/content-analytics.ts` · `src/features/content/server/analytics.ts` · `drizzle/0021_content_analytics.sql`, `0022_content_analytics_rules.sql` · `src/features/content/components/analytics-view.tsx`, `analytics-charts.tsx` · `/content/analytics?window=&platform=&sort=` |

The question this module answers: **which topics generate trust, leads and business opportunities?** Follower count is shown, but it is never the measure of success.

## 1. What is tracked

| Metric | Source |
|---|---|
| Views, reach, impressions, likes, comments, shares, saves | Snapshots (docs/17) |
| Watch time, average view duration, average retention, completion rate | Snapshots (YouTube and video formats) |
| Engagement rate | **Calculated**: (likes + comments + shares + saves) ÷ audience |
| Profile visits, followers gained, website clicks | Snapshots |
| Leads generated | Snapshots ("reported leads", from your notes or insights) **and** sales prospects linked to the content ("attributed prospects") |
| Sales attributed | Snapshots ("reported") **and** won deals from attributed prospects ("won"), by currency |
| Platform-specific metrics | `content_metrics.platform_metrics`, only the current platform's keys are kept: Instagram reach from non-followers %, replays, sends · YouTube impressions CTR %, subscribers lost, end-screen clicks · LinkedIn sends, click-through rate %, profile views from the post. A DB check enforces non-negative numbers. |
| Audience | `audience_snapshots`: followers or subscribers per platform per date (no future dates, one per platform per day) |

Definitions:

- **Current figures:** each metric's most recently recorded value.
- **Audience:** reach if recorded, else views, else impressions.
- **Trust signals:** saves + shares + comments per viewer, i.e. people keeping, recommending or discussing the content. This is a **proxy** and is labelled as one; trust itself isn't measured.
- **Attribution:** when adding a prospect in Sales, "Came from content" links it to a published item (`prospects.content_item_id`, same-owner FK). Its deals then count towards that item: open deals, and won deals with their amounts.

## 2. What is shown

Filters: 30 days, 90 days (default), 12 months, all time (by publish date) · platform.

| Section | Content |
|---|---|
| Tiles | Published (and how many have metrics), audience reached, engagement rate, trust signals, leads reported, prospects attributed (and open deals), deals won (amounts per currency), followers gained ("one signal among many") |
| What the numbers say | Generated statements, each with its numbers. For example: which pillar brings the most leads per piece; which earns the most trust signals; "X reaches the most people, but Y turns attention into more leads"; best format for depth of engagement; content that gained followers but no leads. With too little data it says so and makes no comparison. Unmeasured published items are listed. |
| Best-performing content | Ranked by business value (won deals → leads + prospects → trust), or by leads, trust signals, engagement rate, views or followers |
| By content pillar / format / topic | Items (measured), audience, engagement rate, trust signals, leads per item, prospects, won deals |
| Engagement trends | Engagement rate and trust-signal rate by publishing month, both as % of audience on one axis |
| Lead generation trends | Reported leads vs attributed prospects per month |
| Audience growth | Change per platform since the first snapshot in the window (the last one before the window is the baseline), a line per platform with fixed colours, the snapshot table, and a form to record counts |

Rules that keep it honest:

- **Group rates are weighted:** total engagement ÷ total audience, not an average of per-item rates.
- Groups with fewer than **3 measured items** are marked "small sample", ranked after the others, and never used for the generated statements.
- **Ranking puts business first.** Won deals, then leads and prospects, then trust signals, then reach. A pillar with huge reach and no leads ranks below one that brings customers.
- **Money is never converted or summed across currencies.**

The chart colours are validated categorical tokens `--chart-1/2/3` (blue, orange, aqua), and each colour always means the same platform or series. Every chart has a table or text equivalent.

## 3. REST API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/content/analytics?window=30\|90\|365\|all&platform=&sort=business\|leads\|trust\|engagement\|views\|followers` | Totals, insights, top items, groups by pillar/format/topic/platform, monthly trends, audience snapshots and growth |
| POST / DELETE | `/api/v1/content/audience`, `/api/v1/content/audience/:id` | `{ platform, followers, capturedOn?, notes? }` |
| POST | `/api/v1/content/items/:id/metrics` | Now also takes `platformMetrics` (or `x_<key>` form fields) |
| POST | `/api/v1/sales/prospects` | Now also takes `contentItemId` |

## 4. Tests

- **Unit** (`content-analytics.test.ts`):
  - per-item engagement and trust from recorded counts only
  - weighted group rates; small-sample flags
  - business-first ranking: huge reach doesn't beat leads and won deals
  - item sorts; generated statements and the refusal with too little data
  - monthly trends; audience growth
- **Unit** (`content.test.ts`): per-metric latest values across partial captures.
- **Integration** (`content-analytics.test.ts`, real migrations under the RLS app role):
  - pillar ranking with attributed prospects and a won deal
  - format grouping; window, platform and sort filters
  - generated statements
  - platform extras filtered to the item's platform
  - audience baseline before the window; future follower counts rejected
  - cross-owner attribution rejected
- **Browser** (Playwright):
  - tiles, statements, pillar ranking, business vs followers sort, the platform filter
  - recording follower counts and the growth badges
  - YouTube-only extras saved and shown
  - the content picker in the sales prospect form
  - no overflow at 390 px
