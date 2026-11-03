# 6. Security Requirements

## 1. What we are protecting

| Asset | Sensitivity | Examples |
|---|---|---|
| Financial data | High | Balances, debts, income, transactions |
| Third-party personal data | High | Prospects' and customers' names, phones, emails, call notes |
| Private reflections | High | Journal, reviews, lessons, setbacks |
| Business strategy | Medium | Ideas, pipeline values, product plans |
| Account credentials and sessions | Critical | Password, MFA secret, refresh tokens |

## 2. Threat model (summary)

| Threat | Vector | Primary controls |
|---|---|---|
| Account takeover | Phished or reused password, stolen session | TOTP MFA required (AAL2), strong password policy, short JWT expiry with refresh rotation, sign-out-everywhere |
| Unauthorised sign-up | Someone registers on the public URL | Sign-ups disabled; a `before_user_created` auth hook rejects any email other than the owner's |
| Data leakage via API | Anon or other-user access to PostgREST | RLS on 100% of tables, `security_invoker` views, no `security definer` functions exposed without checks, CI test that fails if any table lacks RLS |
| Key exposure | Secret key shipped to the browser or committed | Only the publishable (anon) key in the client; the secret key only in server-side scripts/CI secrets; secret scanning on the repo |
| XSS | Markdown in journal, notes, content | Sanitised rendering (`rehype-sanitize`), no `dangerouslySetInnerHTML` on user content, strict CSP |
| CSRF | Cross-site form posts | Server Actions check the request origin (built-in); SameSite=Lax cookies; no state-changing GET routes |
| Injection | Search/filter input | Parameterised queries via supabase-js/PostgREST; RPCs use typed parameters, no dynamic SQL from input |
| Data loss | Accidental delete, bad migration, provider incident | Archive-not-delete, expand/contract migrations, daily + weekly off-site backups, restore drills |
| Lost or stolen phone | Offline cache on device | Device lock (OS), logout clears IndexedDB and caches, no sensitive data in service worker caches, remote sign-out |
| Supply chain | Malicious dependency | Lockfile, Dependabot/Renovate, `npm audit` in CI, minimal dependency set |

## 3. Authentication

| ID | Requirement |
|---|---|
| SEC-AUTH-01 | Supabase Auth with email + password (min 12 chars, leaked-password check on). Magic link optional as a second method. |
| SEC-AUTH-02 | **TOTP MFA mandatory.** The `(app)` route guard requires `aal2`. RLS policies on high-sensitivity tables (wealth, journal, contacts) also check `(auth.jwt() ->> 'aal') = 'aal2'`. |
| SEC-AUTH-03 | Public sign-up disabled in project settings, plus an auth hook allow-listing the owner's email (defence in depth). |
| SEC-AUTH-04 | Sessions via `@supabase/ssr` HTTP-only, Secure, SameSite=Lax cookies. Server code validates the user with `auth.getUser()` / `auth.getClaims()`, **never** trusting an unverified `getSession()` on the server. |
| SEC-AUTH-05 | Session refresh in `proxy.ts`. Short access-token lifetime (default 1 h) with refresh-token rotation and reuse detection on. |
| SEC-AUTH-06 | Settings → Security: list sessions, sign out everywhere, re-enrol MFA, recovery codes stored offline by the owner. |
| SEC-AUTH-07 | Auth rate limits left at Supabase defaults or tighter. CAPTCHA (Turnstile) enabled on the login form if abuse appears. |

## 4. Authorisation: row-level security

**Every table has RLS enabled and four owner policies.** The template is applied by a migration helper so no table is ever forgotten:

```sql
alter table public.<table> enable row level security;

create policy "<table>_select_own" on public.<table>
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "<table>_insert_own" on public.<table>
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "<table>_update_own" on public.<table>
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "<table>_delete_own" on public.<table>
  for delete to authenticated using ((select auth.uid()) = user_id);
```

| ID | Requirement |
|---|---|
| SEC-RLS-01 | RLS enabled on 100% of `public` tables. A CI query against `pg_tables`/`pg_class.relrowsecurity` fails the build if any table lacks it. |
| SEC-RLS-02 | Policies target the `authenticated` role only. `anon` has no grants on application tables. |
| SEC-RLS-03 | `(select auth.uid())` wrapped in a sub-select so Postgres evaluates it once per query (performance). `user_id` is indexed on every table. |
| SEC-RLS-04 | All views are created `with (security_invoker = true)`. |
| SEC-RLS-05 | Functions default to `security invoker`. Any `security definer` function lives in the non-exposed `internal` schema, sets `search_path = ''`, and checks `auth.uid()` explicitly. |
| SEC-RLS-06 | Same-owner composite foreign keys ([04 §2](04-database-architecture.md#2-conventions-applied-to-every-table)) prevent cross-user references even if a policy were wrong. |
| SEC-RLS-07 | Insert-only tables (`deal_stage_history`, `change_log`, `score_snapshots`) get no update policy and no delete policy. They are written by triggers/functions. |
| SEC-RLS-08 | Reference data (`fx_rates`) has select-only for `authenticated`. Writes come only from the service role. |
| SEC-RLS-09 | pgTAP test per table: as user A, insert/select/update/delete user B's rows → 0 rows / denied. A synthetic second user exists in test seeds specifically for this. |

## 5. Storage

| ID | Requirement |
|---|---|
| SEC-ST-01 | One **private** bucket `attachments`. No public buckets. |
| SEC-ST-02 | Object path convention `{user_id}/{entity_type}/{entity_id}/{uuid}-{filename}`. Storage policies on `storage.objects` require `(storage.foldername(name))[1] = auth.uid()::text`. |
| SEC-ST-03 | Files are served through short-lived signed URLs (≤ 10 min). |
| SEC-ST-04 | Upload limits: 25 MB per file, MIME allow-list (images, PDF, audio, CSV). |

## 6. Application and transport security

| ID | Requirement |
|---|---|
| SEC-APP-01 | Every Server Action and route handler calls `requireUser()` and validates input with Zod before touching the database. |
| SEC-APP-02 | HTTPS only (HSTS `max-age=63072000; includeSubDomains; preload`). |
| SEC-APP-03 | Content-Security-Policy with nonces: `default-src 'self'`; `connect-src 'self' https://<project>.supabase.co wss://<project>.supabase.co` (+ error tracking host); `img-src 'self' data: blob: https://<project>.supabase.co`; `frame-ancestors 'none'`; `object-src 'none'`; `base-uri 'self'`. |
| SEC-APP-04 | Other headers: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera, mic, geolocation off unless a feature needs them). |
| SEC-APP-05 | User-generated markdown rendered through a sanitiser. External links get `rel="noopener noreferrer"`. |
| SEC-APP-06 | CSV import: parse in a sandboxed server function with size/row limits. Neutralise formula-injection prefixes (`=`, `+`, `-`, `@`) in exported CSVs. |
| SEC-APP-07 | Errors returned to the client are generic. Details go to server logs with PII scrubbed. |
| SEC-APP-08 | No third-party analytics, ads or tracking scripts (NFR-11). |

## 7. Secrets and configuration

| ID | Requirement |
|---|---|
| SEC-SEC-01 | Client env: only `NEXT_PUBLIC_SUPABASE_URL` and the publishable key. |
| SEC-SEC-02 | Server/CI secrets (secret key, DB URL, VAPID private key, backup encryption key) live in Vercel/GitHub encrypted secrets, never in the repo. `.env*` is git-ignored, and `.env.example` documents names only. |
| SEC-SEC-03 | GitHub secret scanning and push protection enabled. |
| SEC-SEC-04 | Rotate the secret key and VAPID keys yearly and after any suspected exposure. |

## 8. Backup, recovery and continuity

| ID | Requirement |
|---|---|
| SEC-BK-01 | Supabase **Pro** plan before real data is entered (daily backups; the free tier pauses inactive projects and has no managed backups). |
| SEC-BK-02 | Weekly GitHub Action: `pg_dump` (schema + data, excluding `auth` secrets) → encrypt with `age` → upload to off-site object storage. Retention: 12 weekly + 60 monthly. |
| SEC-BK-03 | Owner-triggered export in Settings → Data at any time. |
| SEC-BK-04 | Quarterly restore drill into a scratch project, with row counts compared. Results logged in `docs/ops/restore-log.md`. |
| SEC-BK-05 | Targets: RPO ≤ 24 h, RTO ≤ 4 h (NFR-08). |

## 9. Privacy

| ID | Requirement |
|---|---|
| SEC-PR-01 | Store only the contact data needed to sell and follow up. No scraping of personal data. |
| SEC-PR-02 | Call notes are notes. The app does not record calls. If a recording is attached, the owner is responsible for local consent laws (shown as a hint on upload). |
| SEC-PR-03 | Contacts can be fully erased (hard delete of contact + PII in interactions) on request, an exception to archive-not-delete. |
| SEC-PR-04 | If FiveYearOS becomes multi-user (SaaS), a privacy policy, DPA and data-subject request flow are prerequisites. The architecture already supports per-user export and delete. |

## 10. Security checklist per release

- [ ] New tables have RLS + 4 policies + pgTAP isolation test
- [ ] New views are `security_invoker`; new functions are invoker or reviewed definer in `internal`
- [ ] New Server Actions use `createAction` (auth + Zod)
- [ ] No new client env vars beyond publishable values
- [ ] Supabase security advisor shows no warnings
- [ ] `npm audit` shows no high/critical issues
- [ ] CSP updated if a new origin is required
