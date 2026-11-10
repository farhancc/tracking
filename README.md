# FiveYearOS

A personal operating system for a five-year journey toward becoming a successful **entrepreneur, salesperson, software product owner and communication educator**.

FiveYearOS tracks four strategic pillars — **Sales Mastery**, **Product Entrepreneurship**, **Personal Branding** and **Financial Independence** — from a five-year vision down to today's calls, habits and journal entry, and turns that data into weekly, monthly, quarterly and annual reviews.

> **Status:** the five-year strategic goal engine ([docs/08](docs/08-goal-engine.md)) the annual/quarterly roadmap ([docs/09](docs/09-roadmap.md)) weekly planning ([docs/10](docs/10-weekly-planning.md)) the daily execution dashboard ([docs/11](docs/11-daily-dashboard.md)) the sales mastery tracker ([docs/12](docs/12-sales-mastery.md)) the communication mastery system ([docs/13](docs/13-communication-mastery.md)) the sales psychology learning lab ([docs/14](docs/14-psychology-lab.md)) the software product portfolio ([docs/15](docs/15-product-portfolio.md)) the product validation tracker ([docs/16](docs/16-product-validation.md)) content management ([docs/17](docs/17-content-management.md)) content analytics ([docs/18](docs/18-content-analytics.md)) knowledge and reading ([docs/19](docs/19-knowledge.md)) the habit tracker ([docs/20](docs/20-habits.md)) the financial independence dashboard ([docs/21](docs/21-finance.md)) the weekly review engine ([docs/22](docs/22-weekly-review.md)) and the AI strategy advisor ([docs/23](docs/23-ai-advisor.md), needs `ANTHROPIC_API_KEY`; not yet exercised with real credentials) daily mobile use with reminders ([docs/24](docs/24-notifications-mobile.md); push not yet received on a real device) and analytics with CSV/PDF reports ([docs/25](docs/25-analytics.md)) are implemented, with schema, REST API, UI and tests. Sign-in is password + authenticator app (TOTP) with recovery codes ([docs/06 §11](docs/06-security.md#11-implementation-status-login-milestone)). To go live, follow [docs/26](docs/26-deployment.md) and [the checklist](docs/28-production-checklist.md); the audit results are in [docs/27](docs/27-testing-report.md) and the [user guide](docs/29-user-guide.md) explains daily use. Architecture: [`docs/README.md`](docs/README.md).

## Planned stack

Next.js (App Router, TypeScript) · Tailwind CSS · shadcn/ui · Neon serverless PostgreSQL · Drizzle ORM · self-issued JWT authentication (`jose`, argon2id, TOTP MFA) · Installable PWA · Recharts

## Architecture documents

| # | Document | Covers |
|---|----------|--------|
| 0 | [Overview & key decisions](docs/README.md) | Summary, the decisions that make it last 5+ years, open questions |
| 1 | [Product requirements](docs/01-product-requirements.md) | PRD, functional requirements, non-functional requirements |
| 2 | [Application modules](docs/02-application-modules.md) | Modules, metric catalogue, scoring model |
| 3 | [User journeys & navigation](docs/03-user-journeys-and-navigation.md) | Journeys, information architecture, route map |
| 4 | [Database architecture](docs/04-database-architecture.md) | Schema, ERDs, metrics engine, analytics layer, evolution playbook |
| 5 | [Component architecture](docs/05-component-architecture.md) | Code structure, data flow, PWA/offline, component library, testing |
| 6 | [Security](docs/06-security.md) | Threat model, auth, RLS, headers, backups, privacy |
| 7 | [Development milestones](docs/07-development-milestones.md) | Phased roadmap with exit criteria |
| 8 | [Goal engine](docs/08-goal-engine.md) | Five-year → daily hierarchy, outcome rules, REST API, interfaces, tests |
| 9 | [Roadmap](docs/09-roadmap.md) | 5 annual plans, 20 quarters, OKRs, deliverables, KPIs, risks, realism checks |
| 10 | [Weekly planning](docs/10-weekly-planning.md) | Weekly goals by area, tasks with time tracking, carry-forward, outcome-based scorecard |
| 11 | [Daily dashboard](docs/11-daily-dashboard.md) | Today screen: mission, execution with start/finish, habits, available time, reflection |
| 12 | [Sales mastery](docs/12-sales-mastery.md) | Activity log, funnel rates and trends, deals, targets per track and currency, learning journal |
| 13 | [Communication mastery](docs/13-communication-mastery.md) | 14 skills, assessment-based proficiency, daily exercises, audio recordings |
| 14 | [Psychology lab](docs/14-psychology-lab.md) | Concepts with evidence levels, spaced review, experiments, earned deep understanding |
| 15 | [Product portfolio](docs/15-product-portfolio.md) | Products, stages, MRR/churn, revenue & expense reports, backlog, feedback, bugs, releases, invest/pause/discontinue |
| 16 | [Product validation](docs/16-product-validation.md) | 12 validation steps with evidence, interview log, competitors, demand ladder, MVP gate |
| 17 | [Content management](docs/17-content-management.md) | Positioning, pillars, 8-stage pipeline, idea library, calendar, metric snapshots |
| 18 | [Content analytics](docs/18-content-analytics.md) | Trust signals, leads and won deals by pillar/format/topic, trends, audience growth |
| 19 | [Knowledge and reading](docs/19-knowledge.md) | Library, concepts, reading goal and daily log, practice tasks and sales-journal links |
| 20 | [Habits](docs/20-habits.md) | Flexible schedules, rest days, consistency, streaks, missed-habit analysis, priority correlation |
| 21 | [Finance](docs/21-finance.md) | Income, expenses, accounts, net worth, FI target and projection, milestones, forecasts kept apart |
| 22 | [Weekly review](docs/22-weekly-review.md) | Twelve questions, report by pillar, direct observations, recurring patterns, approvable goal suggestions |
| 23 | [AI advisor](docs/23-ai-advisor.md) | Read-only tools over your data, verified facts vs assumptions, proposals that need your confirmation |
| 24 | [Mobile, offline and notifications](docs/24-notifications-mobile.md) | Installable PWA, bottom tabs, one-tap check-in, offline pages and queued actions, reminders, inbox, Web Push, preference centre |
| 25 | [Analytics and reports](docs/25-analytics.md) | 11 sections with planned vs actual, 7d–5y filters and monthly reports, activity-vs-outcome reading, CSV and PDF export |
| 26 | [Deployment](docs/26-deployment.md) | Vercel + Neon setup, every environment variable, migrations, backups and restore, key rotation, account recovery |
| 27 | [Testing report](docs/27-testing-report.md) | Final audit by area, the 14 workflows end to end, accessibility and performance, defects fixed, what's not verified |
| 28 | [Production checklist](docs/28-production-checklist.md) | What to tick before and after going live |
| 29 | [User guide](docs/29-user-guide.md) | How to use FiveYearOS day to day, week to week and month to month |
| ADR | [ADR-001: JWT auth and Neon Postgres](docs/adr/ADR-001-jwt-auth-and-neon.md) | Why the data and auth platform is Neon + self-issued JWTs instead of Supabase |

## Run it locally

Requirements: Node.js 20.9+, PostgreSQL 16+ (local, or a Neon branch).

1. Install dependencies.

   ```bash
   npm install
   ```

2. Create the database roles once. Run this as a Postgres superuser locally. On Neon the project owner role already exists; create the two login roles after step 4.

   ```sql
   create role fyos_owner login createdb createrole password 'dev-owner';
   ```

3. Create the database.

   ```bash
   PGPASSWORD=dev-owner createdb -h 127.0.0.1 -U fyos_owner fyos_dev
   ```

4. Configure the environment: copy `.env.example` to `.env.local`, point `MIGRATION_DATABASE_URL` at `fyos_dev` as `fyos_owner`, then apply the migrations.

   ```bash
   npm run db:migrate
   ```

5. Create login roles for the app and auth group roles, which the migrations created. Use them in `DATABASE_URL` and `AUTH_DATABASE_URL`.

   ```sql
   create role fyos_app_dev  login password 'dev-app'  in role fyos_app;
   create role fyos_auth_dev login password 'dev-auth' in role fyos_auth;
   ```

6. Generate access-token signing keys and paste the output into `.env.local`.

   ```bash
   npm run auth:keygen
   ```

7. Start the app, open http://localhost:3000 (it opens on Today) and choose **Continue as dev owner** (needs `FYOS_DEV_LOGIN=1`), or set a real password with `npm run owner:create -- you@example.com` and sign in with it (you'll set up an authenticator app on first sign-in).

   ```bash
   npm run dev
   ```

API clients can get a development Bearer token:

```bash
npm run dev:token
```

| Command | Does |
|---|---|
| `npm test` | Unit tests |
| `npm run test:db` | Database integration tests (needs `TEST_ADMIN_DATABASE_URL`) |
| `npm run typecheck` / `npm run lint` / `npm run build` | Static checks and production build |
| `npm run db:generate` | Generate a migration after changing `src/db/schema` |
| `npm run test:e2e` | The 14 major workflows end to end against a running build (docs/27 §3) |
| `scripts/backup.sh` / `scripts/restore.sh` | Logical backup (encrypt it with `age`) and exact restore (docs/26 §6) |
| `npm run push:keygen` | Generate VAPID keys for Web Push (docs/24) |
| `npm run auth:keygen` | Generate the JWT signing keys and `AUTH_ENCRYPTION_KEY` |
| `npm run owner:create -- <email>` / `npm run owner:reset -- <email>` | Create the owner account or set a new password; `reset` also removes the authenticator |
