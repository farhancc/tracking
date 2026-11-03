# FiveYearOS

A personal operating system for a five-year journey toward becoming a successful **entrepreneur, salesperson, software product owner and communication educator**.

FiveYearOS tracks four strategic pillars — **Sales Mastery**, **Product Entrepreneurship**, **Personal Branding** and **Financial Independence** — from a five-year vision down to today's calls, habits and journal entry, and turns that data into weekly, monthly, quarterly and annual reviews.

> **Status:** the five-year strategic goal engine is implemented: schema, REST API, UI and tests ([docs/08](docs/08-goal-engine.md)). Login (password + TOTP) is the next milestone. Architecture: [`docs/README.md`](docs/README.md).

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

7. Start the app, open http://localhost:3000 and choose **Continue as dev owner** (needs `FYOS_DEV_LOGIN=1`).

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
