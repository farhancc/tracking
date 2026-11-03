# ADR-001: Neon PostgreSQL and self-issued JWT authentication

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-11-03 |
| **Supersedes** | The Supabase (PostgreSQL + Auth + Storage) choice in blueprint v1.0 |

## Context

The owner asked for **JWT authentication** and **Neon** serverless PostgreSQL instead of Supabase. FiveYearOS has exactly one user, no sign-up and no third-party login. It must hold five years of data without a redesign and stay portable.

Removing Supabase removes four things the v1.0 blueprint relied on:

| Supabase feature | Replacement |
|---|---|
| Supabase Auth (`auth.uid()`, MFA, sessions) | Self-issued JWTs in `lib/auth`, built from `jose`, argon2id and `otplib`; identity tables in our own `auth` schema |
| PostgREST (browser → database API, used for offline replay) | No browser database access. All access goes through the Next.js server. Offline replay uses a versioned `POST /api/v1/sync` route. |
| `pg_cron` and Edge Functions | Vercel Cron → `/api/cron/[job]` route handlers |
| Supabase Storage | S3-compatible object storage (Cloudflare R2) with presigned URLs |

Without PostgREST, the app needs a typed data-access layer. **Drizzle ORM** was chosen: SQL-first, TypeScript-native types, migrations as plain SQL, and first-class Neon support.

## Decision

1. **Database:** Neon PostgreSQL 17. The pooled endpoint serves the runtime, the direct endpoint serves migrations and backups. Neon branches are used for each PR preview and CI run, and for point-in-time restores.
2. **Access:** Drizzle ORM. Every query runs inside `withUser()`, which sets the transaction-local `app.user_id`. RLS policies compare `user_id` to `app.current_user_id()`. Three roles: `fyos_owner`, `fyos_app` and `fyos_auth`.
3. **Authentication:** ES256 access JWT (15 min) and a rotating opaque refresh token (30 days sliding, 90 days absolute), both in `HttpOnly` `__Host-` cookies. TOTP MFA is mandatory. No sign-up route; the owner is created by CLI.

## Alternatives considered

| Option | Why not chosen (for now) |
|---|---|
| Keep Supabase | The owner chose Neon + JWT |
| An auth library (Auth.js, Better Auth) on Neon | A library would mean less hand-written code, but more surface area than a single-owner app needs (adapters, providers, sign-up flows). It's the **fallback** if the self-built module proves costly to maintain. Because `lib/auth` exposes only `requireUser()` and the route handlers, a swap stays local. |
| A managed auth vendor (e.g. Clerk, Neon's own auth offering) | Adds a vendor and an external origin in the CSP for one user. Not in line with "JWT auth" as requested. |
| Neon RLS / Data API with the JWT verified inside Postgres | Would let the browser query the database directly. Unnecessary when the server already mediates every request, and it ties the security model to a Neon-specific feature. Worth revisiting if a public API is ever needed. |
| Neon HTTP driver | No interactive transactions, which `withUser()` needs |

## Consequences

**Positive**
- The database is never exposed to the browser. RLS becomes defence in depth instead of the only gate.
- One token model covers pages, Server Actions, the sync API and any future mobile client.
- No auth-vendor lock-in, and the schema runs on any PostgreSQL 16+ (NFR-16).
- Neon branching gives cheap, isolated preview and CI databases and non-destructive restores.

**Negative and mitigations**

| Cost | Mitigation |
|---|---|
| We own the correctness of the auth code | Vetted primitives, a narrow scope, ≥ 90% test coverage of `lib/auth`, release checklist ([06 §10](../06-security.md#10-security-checklist-per-release)) |
| More server code (sync API, cron routes, presigning) | Each is small and isolated, and specified in [05](../05-component-architecture.md) |
| Neon scale-to-zero cold starts | Tune or disable suspend on a paid plan if the first open of the day is slow |
| Frequent cron schedules may need a paid Vercel plan | Fallback to a GitHub Actions schedule or a daily digest |
| M0 grows from 2 to 3 weeks | Accepted. Auth is foundational and must be right before real data exists. |

## Follow-ups

- M0 spike: measure `node-postgres` vs the Neon serverless WebSocket driver from the Vercel region and pick one.
- Write `docs/ops/rotation.md` (key and password rotation) and `docs/ops/restore-log.md`.
