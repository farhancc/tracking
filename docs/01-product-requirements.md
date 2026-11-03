# 1. Product Requirements Document

## 1.1 Product statement

**FiveYearOS** is a personal operating system that connects a five-year vision to daily execution across four pillars: Sales Mastery, Product Entrepreneurship, Personal Branding and Financial Independence. Quick capture makes logging nearly free, the metrics engine turns raw activity into honest progress signals, and structured reviews make sure every week, month, quarter and year ends with a decision.

## 1.2 Problem

| Problem | Consequence today |
|---|---|
| Goals live in notebooks, activity lives in a CRM, money lives in a bank app, content lives on platforms | There is no single view of whether the five-year plan is on track |
| Lagging results (revenue, net worth, followers) move slowly | Motivation fades. Leading indicators (dials, posts, build hours) aren't tracked, so effort isn't visible |
| Tools optimise for one domain (CRM, budgeting, habit apps) | Cross-pillar questions can't be answered, for example "Did more content raise inbound sales conversations?" |
| Generic trackers get redesigned or abandoned | Years of history are lost when you switch tools |

## 1.3 Target user

A single owner, the **Operator**. They:

- sell (cold calling, prospecting, closing) for an employer and/or their own ventures;
- build and launch software products and educational offerings;
- create content about communication, sales psychology, human behaviour and entrepreneurship;
- manage personal finances toward financial independence;
- use a phone throughout the day (logging) and a laptop for deep work and reviews.

There is exactly one user account. The data model is still multi-user safe (see D8) so the product could later be offered to others.

## 1.4 Goals and success metrics for the app itself

| Goal | Success metric | Target |
|---|---|---|
| G1 Logging is effortless | Median time to log a call outcome | ≤ 10 seconds, ≤ 3 taps |
| G2 The app is used daily | Days with at least one entry / days elapsed | ≥ 90% |
| G3 Reviews happen | Weekly reviews completed per year | ≥ 48 of 52 |
| G4 Progress is visible | Every headline KPI reachable from Today/Dashboard | ≤ 2 taps |
| G5 History is trustworthy | Data loss incidents over 5 years | 0 (RPO ≤ 24h) |
| G6 It lasts | Breaking schema redesigns over 5 years | 0 (only additive migrations) |

## 1.5 Scope

**In scope for v1 (Milestones 0–8):** onboarding, Today, quick capture, tasks, habits, focus sessions, journal, vision and goal hierarchy with key results, metrics engine, weekly/monthly/quarterly/annual reviews, Sales Lab, Product Studio, Brand Studio, Wealth, Learning, Analytics dashboards, data export, PWA install, offline capture, reminders.

**Non-goals (v1):**

- Team CRM, shared pipelines or multi-user collaboration.
- Double-entry accounting, tax filing or invoicing.
- Bank API aggregation (CSV import only).
- Auto-posting to social platforms or pulling platform analytics by API (manual snapshots; APIs can be added later as importers).
- Built-in dialler or call recording.
- AI features (planned as a later layer; the schema keeps the raw text they would need).

## 1.6 Assumptions and constraints

| Type | Statement |
|---|---|
| Assumption | One owner. Mobile for capture, desktop for planning and reviews. |
| Assumption | Data volume stays under ~250k rows in 5 years ([overview §4](README.md#4-expected-data-volume-five-years-heavy-use)). |
| Constraint | Stack is fixed: Next.js + TypeScript, Tailwind, shadcn/ui, Supabase (Postgres + Auth), PWA, Recharts. |
| Constraint | A solo developer builds and maintains it, so prefer boring, well-documented patterns and few moving parts. |
| Constraint | Hosting cost should stay low: Vercel plus Supabase Pro once real data exists. |

## 1.7 Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Logging friction leads to abandonment | High | High | Quick capture, +1 counters, offline support, evening shutdown ritual, derived metrics (log once, count everywhere) |
| Over-engineering delays daily use | Medium | High | Milestone 1 ships the daily loop first so data collection starts early |
| Data loss (free-tier pause, bad migration) | Medium | Critical | Supabase Pro backups, weekly off-site `pg_dump`, expand/contract migrations, restore drills |
| Changing goals invalidate history | High | Medium | Versioned visions, effective-dated targets, score snapshots with formula version |
| Vendor or framework churn | Medium | Medium | Standard Postgres, full export, domain logic isolated from the framework |
| Sensitive data exposure (finances, contacts) | Low | High | RLS on every table, MFA, no public sign-up, private storage, security headers ([06](06-security.md)) |

---

## 1.8 Functional requirements

Priority uses MoSCoW: **M** must, **S** should, **C** could. IDs are stable so tests and issues can reference them.

### Onboarding and core (ON)

| ID | Requirement | P |
|---|---|---|
| ON-01 | Sign in with email + password, with optional magic link. Enrol TOTP MFA. | M |
| ON-02 | Public sign-up is disabled. Only the owner's account can exist. | M |
| ON-03 | Onboarding wizard captures journey start date (end = start + 5 years − 1 day), timezone, base currency and week start day. | M |
| ON-04 | Onboarding captures the five-year vision statement and one five-year outcome per pillar. | M |
| ON-05 | Onboarding offers a seeded metric catalogue per pillar. The owner picks starter metrics and sets weekly targets. | M |
| ON-06 | Onboarding records a financial baseline (accounts and opening balances). | S |
| ON-07 | Pillars can be renamed, recoloured, reweighted, reordered, added and archived. | M |

### Today and planning (TD)

| ID | Requirement | P |
|---|---|---|
| TD-01 | Today screen shows intention, top three priorities, scheduled tasks, habits due, leading-indicator counters with targets, follow-ups due and content scheduled today. | M |
| TD-02 | Morning plan flow: set intention, choose top three priorities from existing or new tasks. | M |
| TD-03 | Evening shutdown flow: finish habit check-ins, confirm metrics, journal (mood, energy, win, lesson), roll unfinished tasks forward. | M |
| TD-04 | Weekly plan: theme, 3–5 weekly outcomes linked to goals, preview of weekly metric targets. | M |
| TD-05 | Tasks: create/edit/complete with pillar, goal or project, due date, scheduled date, priority and status. | M |
| TD-06 | Recurring tasks (RRULE-based). | S |
| TD-07 | Focus sessions: timer or manual entry, linked to pillar and optionally task, product or content item. | S |
| TD-08 | Inbox for untriaged captures. | S |

### Quick capture (QC)

| ID | Requirement | P |
|---|---|---|
| QC-01 | Global quick capture (mobile floating button, desktop shortcut) for task, interaction, metric value, content idea, product idea, money entry, journal note and win. | M |
| QC-02 | Log a call outcome in ≤ 3 taps without choosing a contact. | M |
| QC-03 | Captures made offline are queued and synced automatically, without duplicates. | S |
| QC-04 | PWA app-icon shortcuts: *Log call*, *Quick capture*, *Today*. | C |

### Vision and goals (GL)

| ID | Requirement | P |
|---|---|---|
| GL-01 | Five-year vision is versioned. Editing creates a new version and history is viewable. | M |
| GL-02 | Goal hierarchy: five-year → year → quarter → month. Every goal has one pillar and a period. | M |
| GL-03 | Key results with baseline and target, linked to a metric, calculate progress automatically. | M |
| GL-04 | Goals can use key-result, milestone or manual progress modes. | M |
| GL-05 | Goal health (on track / at risk / off track) is suggested from progress vs time elapsed. The owner can override it. | S |
| GL-06 | Goal tree view flags goals with no parent and parents with no active children. | S |
| GL-07 | Journey timeline of significant events, created automatically (first sale, launch, debt paid off) or by hand. | S |

### Metrics (MT)

| ID | Requirement | P |
|---|---|---|
| MT-01 | Define metrics with unit, flow/stock type, aggregation, direction, leading/lagging flag and pillar. | M |
| MT-02 | Manual entries with date, value, optional note and optional scope (product, platform, account, venture). | M |
| MT-03 | Derived metrics are computed from domain data (calls, deals, content, focus time, net worth, MRR) without double entry. | M |
| MT-04 | Effective-dated targets per period type (day/week/month/quarter/year). | M |
| MT-05 | +1 / −1 counter widgets on Today for count metrics. | M |
| MT-06 | Archiving a metric hides it but keeps its history and charts. | M |

### Habits (HB)

| ID | Requirement | P |
|---|---|---|
| HB-01 | Habits can be boolean, count or duration, with scheduled weekdays and a pillar. | M |
| HB-02 | Daily check-in. Skip with a reason (a skip doesn't break the streak). | M |
| HB-03 | Streaks, adherence %, and a calendar heatmap per habit and per pillar. | M |
| HB-04 | Changing a habit target doesn't change past adherence (the target is snapshotted on each log). | S |

### Reviews and journal (RV)

| ID | Requirement | P |
|---|---|---|
| RV-01 | Daily journal: mood (1–5), energy (1–5), wins, lessons, gratitude, free markdown. | M |
| RV-02 | Weekly review: auto-summary (metrics vs targets, tasks, habits, deals moved, content published, money in/out, pillar scores), reflection questions, next-week plan. | M |
| RV-03 | Monthly review. | M |
| RV-04 | Quarterly review (goal grading and next quarter's goals) and annual review (year grading, vision recalibration). | S |
| RV-05 | Review templates are editable and versioned. Past reviews keep their questions. | S |
| RV-06 | Pillar self-ratings (1–10) in each review, charted over time. | S |
| RV-07 | Overdue-review banner and reminders. | S |

### Sales Lab (SL)

| ID | Requirement | P |
|---|---|---|
| SL-01 | Contacts and organisations with source, relationship stage, tags and next follow-up date. | M |
| SL-02 | Interactions (call, email, DM, meeting, demo) with purpose, outcome, duration, notes and next step. Contact optional. | M |
| SL-03 | Follow-up queue: due today and overdue. | M |
| SL-04 | Deals pipeline kanban with configurable stages. Stage changes are recorded automatically. | M |
| SL-05 | Funnel analytics: dials → connects → conversations → meetings → proposals → won, with conversion rates by week and month. | M |
| SL-06 | Every deal and interaction belongs to a venture (employer, own business, freelance). | M |
| SL-07 | Playbook library (scripts, openers, discovery questions, objections and responses, closes, stories), linked to interactions, with usage and win statistics. | S |
| SL-08 | Practice sessions (role-play, call review, drills) linked to a skill, with a self-rating. | S |
| SL-09 | Deal velocity (days per stage) and win/loss reasons. | S |
| SL-10 | CSV import of contacts. | C |

### Product Studio (PS)

| ID | Requirement | P |
|---|---|---|
| PS-01 | Problem/idea backlog with problem statement, target customer, evidence and scores (pain, frequency, willingness to pay, reach, confidence, effort). | M |
| PS-02 | Idea status flow: captured → researching → validating → validated → building, or rejected. | M |
| PS-03 | Discovery interviews are interactions with purpose `discovery`, linked to an idea, with insights. | S |
| PS-04 | Products of kind software, course, workshop, coaching, template or service, with lifecycle status and launch date. | M |
| PS-05 | Experiments with hypothesis, success criteria, dates and result. | S |
| PS-06 | Releases and launches log. | S |
| PS-07 | Customer subscriptions and one-off sales per product, giving MRR, ARR, customers and churn. | M |
| PS-08 | Product-scoped metrics (signups, active users, conversion). | S |
| PS-09 | Build hours per product from focus sessions. | C |

### Brand Studio (BS)

| ID | Requirement | P |
|---|---|---|
| BS-01 | Content board: idea → outline → drafting → editing → scheduled → published. | M |
| BS-02 | Content item with hook, body (markdown), format, topic and schedule date. | M |
| BS-03 | Content calendar (week and month views). | M |
| BS-04 | One content item can have many publications (platform + URL + date). | M |
| BS-05 | Performance snapshots per publication (impressions, views, likes, comments, shares, saves, clicks, followers gained). | S |
| BS-06 | Audience size per platform as platform-scoped stock metrics. | M |
| BS-07 | Topic taxonomy (seeded: communication, sales psychology, human behaviour, entrepreneurship). | M |
| BS-08 | Teaching log: workshops, talks and courses delivered, attendees and feedback. | S |
| BS-09 | Repurposing lineage (parent/child content). | C |

### Wealth (WL)

| ID | Requirement | P |
|---|---|---|
| WL-01 | Accounts (assets and liabilities) with kind, currency, institution and optional venture. | M |
| WL-02 | Monthly balance snapshots, giving net worth and composition history. | M |
| WL-03 | Income streams. Income by stream and month. Share of income from own ventures. | M |
| WL-04 | FI plan: annual expenses, safe withdrawal rate, expected return and inflation give FI number, FI % and projected FI date. | M |
| WL-05 | Monthly savings rate. | M |
| WL-06 | Transactions: manual entry and CSV import with de-duplication and categorisation rules. | S |
| WL-07 | Monthly budgets by category; budget vs actual. | S |
| WL-08 | Debt terms (rate, minimum payment) and payoff projection (avalanche/snowball). | S |
| WL-09 | Emergency fund coverage in months. | S |
| WL-10 | Multi-currency accounts with FX rates; all reports in base currency. | C |

### Learning (LN)

| ID | Requirement | P |
|---|---|---|
| LN-01 | Skills matrix per pillar with periodic 1–10 self-assessments and trend. | S |
| LN-02 | Resources (book, course, podcast, mentor) with status, dates and rating. | S |
| LN-03 | Notes/insights in markdown, linked to resource and pillar, full-text searchable. | S |

### Analytics and dashboard (AN)

| ID | Requirement | P |
|---|---|---|
| AN-01 | Dashboard: journey progress (day N of 1,826), overall and per-pillar scores, current-quarter goals, headline KPIs. | M |
| AN-02 | Pillar analytics pages with grain switch (day/week/month/quarter/year) and date range. | M |
| AN-03 | Weekly score snapshots persisted and charted across the journey. | M |
| AN-04 | Period comparison (this vs previous, year over year). | S |
| AN-05 | Auto-generated year-in-review per journey year. | S |
| AN-06 | Exploratory correlation view between any two metrics. | C |

### Data and settings (DT)

| ID | Requirement | P |
|---|---|---|
| DT-01 | Full data export (JSON bundle and per-table CSV). | M |
| DT-02 | Light/dark theme. | M |
| DT-03 | Archive instead of delete. Archived items can be restored. | M |
| DT-04 | Global search across contacts, deals, content, ideas, notes, tasks and goals. | S |
| DT-05 | Tags across entities. | S |
| DT-06 | Reminders (web push, email fallback): morning plan, evening shutdown, weekly review, follow-ups due. | S |
| DT-07 | Import a previous export (restore into an empty account). | S |
| DT-08 | File attachments (receipts, screenshots, slides) on any entity. | C |

---

## 1.9 Non-functional requirements

| ID | Category | Requirement | Measure |
|---|---|---|---|
| NFR-01 | Performance | Today page loads fast on a mid-range phone over 4G | LCP ≤ 2.5 s, INP ≤ 200 ms (p75) |
| NFR-02 | Performance | Quick capture feels instant | Optimistic UI ≤ 100 ms; server confirmation ≤ 1 s |
| NFR-03 | Performance | Analytics queries stay fast with 5 years of data | ≤ 300 ms server time p95 at 1M rows |
| NFR-04 | Performance | Small initial JavaScript | Today route ≤ 200 KB gzipped; charts lazy-loaded |
| NFR-05 | Scalability | Schema supports 10 years / 5M rows without structural change | Load test with synthetic 10-year dataset before v1 |
| NFR-06 | Scalability | Multi-user ready | Every table user-scoped with RLS; no global mutable state |
| NFR-07 | Availability | Inherits platform SLAs | ≥ 99.5% monthly |
| NFR-08 | Durability | Recovery objectives | RPO ≤ 24 h, RTO ≤ 4 h, quarterly restore drill |
| NFR-09 | Offline | Core capture works without network | Today, habits, quick capture, counters usable offline; last-viewed dashboards readable |
| NFR-10 | Security | See [06-security.md](06-security.md) | MFA, RLS on 100% of tables, security headers grade A |
| NFR-11 | Privacy | No third-party trackers; data never leaves owner-controlled services | Allow-list of outbound domains in CSP |
| NFR-12 | Usability | Mobile-first, thumb-reachable primary actions | Core actions ≤ 3 taps; touch targets ≥ 44 px |
| NFR-13 | Accessibility | WCAG 2.2 AA | axe checks in CI; keyboard navigation; charts have table/text alternatives |
| NFR-14 | Maintainability | Strict typing and validated boundaries | TS `strict`; Zod at every input; generated DB types; ≥ 80% coverage of `lib/domain` |
| NFR-15 | Maintainability | Decisions recorded | Architecture Decision Records in `docs/adr/` |
| NFR-16 | Portability | No lock-in beyond Supabase Auth | Plain Postgres schema; full export; no proprietary DB features in business logic |
| NFR-17 | Observability | Errors and slow queries visible | Error tracking on client and server; Supabase query performance reviewed monthly |
| NFR-18 | Compatibility | Supported platforms | Latest 2 versions of Chrome, Edge, Firefox, Safari; iOS 17+ and Android installable PWA |
| NFR-19 | Internationalisation | Locale-correct display | English UI; locale-aware number, currency and date formats; day boundaries in owner's timezone |
| NFR-20 | Cost | Predictable running cost | Fixed monthly hosting; no per-event billing services on the hot path |
