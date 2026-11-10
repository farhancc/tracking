# 27. Final audit and testing report

| | |
|---|---|
| **Date** | 2026-11-10 |
| **Build** | Next.js 16.4.2 production build (`next build && next start`), Postgres 16, Chromium (Playwright) emulating an Android phone (412 × 915) and a desktop (1280 × 900) |
| **Result** | All 14 major workflows pass end to end. 1 critical, 4 high and 5 medium defects were found and fixed. 5 low-priority items remain open (§7). Several things could not be verified without your production accounts (§6). |

## 1. Method

- **Automated tests:**

  | Suite | Size | Result |
  |---|---|---|
  | Unit | 22 files, 96 tests | Pass |
  | Database integration (real Postgres, RLS, separate roles) | 20 files, 78 tests | Pass, including 3 full runs and 2 runs with shuffled file order |
  | Typecheck, lint, `drizzle-kit check` | | Pass |
  | Production build | with and without environment | Pass |

- **End-to-end:** `tests/e2e/workflows.cjs` drives the 14 workflows through the UI on a brand-new account, signed in with password + TOTP, on a phone-sized viewport. It checks for horizontal scrolling on every page.
- **API robustness sweep:** every `/api/v1` route (about 4,100 requests) with junk bodies, wrong types, oversized fields, malformed ids and wrong methods. Goal: no 5xx.
- **Accessibility and performance:**
  - axe-core (WCAG 2.0/2.1 A/AA + best practice) on 26 pages;
  - load timings with 4× CPU slowdown and a slow-4G network profile.
- **Database inspection:** RLS coverage, policies, security-definer functions, views, foreign-key indexes, and a backup/restore round trip.
- **CI on GitHub:** see §8.

## 2. Review by area

| Area | Finding | Status |
|---|---|---|
| Database relationships | Same-owner composite foreign keys between user tables; cascades and restricts as designed. 65 foreign keys, mostly `user_id → auth.users`, have no index that starts with that column. That's fine for one owner, because every row belongs to the same user; add them before any multi-user use. | OK (low note) |
| Authentication | **Production sign-in did not exist (critical)**: only the development login, so no one could sign in to a deployment. Built password + TOTP with recovery codes, refresh rotation and reuse detection, lockout, rate limiting and an audit log (docs/06 §11). | Fixed |
| Authorisation | Every data access runs in `withUser()`. Route handlers and Server Actions re-check the session (revocation takes effect immediately). Auth routes accept only same-origin JSON POSTs. | OK |
| Row-level security | 71 of 71 public tables have RLS with 4 owner-only policies (284 in total) for `fyos_app`. All views are `security_invoker`. The one `security definer` function (push endpoint claim) has execute granted only to `fyos_app`. The app role cannot read any `auth.*` table (integration test). | OK |
| API validation | No 5xx under the sweep after fixes. A PATCH with no recognised fields returned 500 on 18 endpoints; it now returns 400. | Fixed |
| Error handling | One error mapper turns validation, constraint and rule errors into 4xx with readable messages. Unknown errors become a generic 500 without internals (unit test). Missing storage configuration now returns 503 with the reason. | Fixed |
| Mobile responsiveness | No horizontal scrolling on any page at 390–412 px. **Today's quick-add bar was hidden behind the phone tab bar (high)**, introduced with the bottom navigation; it now sits above it, and the E2E test checks the overlap. | Fixed |
| PWA installation | Manifest, icons, service worker, offline page; daily pages kept ready offline; actions made offline replay on reconnect (docs/24). | OK |
| Data persistence | Concurrent first visits could create **duplicate default habit sets** (no unique key) and **crash the first Sales visit** (high). Serialised with an advisory lock and `ON CONFLICT`. The concurrency test fails without the fix (27 habits instead of 9). | Fixed |
| Backup and recovery | `backup.sh` / `restore.sh` round trip is identical (§5). Daily encrypted backup workflow added. Found while building it: restoring with `--no-privileges` would have dropped the migrations' revokes, so the restore keeps ACLs. | Done |
| Analytics accuracy | Five-year progress rebuilt from measurements equals the stored `completion_pct` today and the correct value 21 days ago. Sales counts and prorated targets match by period (docs/25 tests). | OK |
| Notification reliability | Dedupe keys make the job safe to repeat. A gone device is removed after its first failure and not tried again in the same run. Failures are counted. The cron endpoint rejects a missing or wrong secret. | OK (real push to a device not verified, §6) |
| Accessibility | axe found 10 violations across 26 pages:<br>• status text and badges below 4.5:1;<br>• links nested inside `<summary>` in the goal tree, which also used ARIA tree roles without tree keyboard support;<br>• scrollable tables not reachable by keyboard;<br>• an empty table header.<br>All fixed: **0 violations on all 26 pages**. Focus is kept clear of the sticky header and tab bar (`scroll-padding`). | Fixed |
| Performance | §4. Every page shows its heading in under 0.7 s under 4× CPU slowdown on slow 4G. Pages are static shells with streamed data. | OK |

## 3. The 14 workflows (end to end, through the UI)

Run on a new account in one pass: **15 of 15 steps pass in 21 s, no page errors.** Command: `npm run test:e2e`, output below.

| # | Workflow | What the test does and checks |
|---|---|---|
| 0 | Sign in | Password, then authenticator enrolment (QR + code), recovery codes, journey setup |
| 1 | Create five-year vision | Saves the vision; "Version 1" shown |
| 2 | Create annual objectives | Five-year goal with metric and target, then an annual objective under it |
| 3 | Create quarterly milestones | Quarterly objective under the annual one; visible in the goal tree |
| 4 | Create weekly goals | Weekly goal serving the quarterly milestone, with 2 estimated tasks |
| 5 | Generate daily tasks | One pulled from the week plan into Today, one captured with the bottom bar (checked not covered by the tab bar) |
| 6 | Complete daily tasks | Both completed; progress ring 0% → 60% |
| 7 | Record sales performance | One-tap call outcomes; dashboard shows 3 cold calls, 1 meeting |
| 8 | Record communication practice | Assessment (level 4 with evidence) and a practice session |
| 9 | Manage software products | Product created; revenue transaction and monthly MRR/customers recorded |
| 10 | Publish and track content | Idea → published on LinkedIn (wrong format refused with a clear message) → metrics with 2 leads |
| 11 | Record financial data | Income, expense, investment account with balance |
| 12 | Complete weekly review | Answers and reasons, then "Review completed" |
| 13 | Generate monthly reports | Monthly report for the current month shows the sales and content figures; PDF downloaded and checked to be a PDF |
| 14 | View five-year progress | After logging a measurement, the journey report shows 7.5% actual vs 2.2% planned (15,000 of 200,000) |

```
✔ 0 signed in with password + TOTP on a new account and set up the journey
✔ 1 five-year vision saved (version 1)
✔ 2 five-year goal and an annual objective under it created
✔ 3 quarterly milestone created under the annual objective; visible in the goal tree
✔ 4 weekly goal serving the quarterly milestone, with 2 planned tasks
✔ 5 daily tasks generated: one pulled from the week plan, one captured for today
✔ 6 both tasks completed; progress ring "Daily progress 0%" -> "Daily progress 60%"
✔ 7 sales calls logged with one tap: cold calls 3, meetings booked 1
✔ 8 communication: assessed level 4 with evidence, practice session logged
✔ 9 product created; pilot revenue and monthly metrics (MRR, customers) recorded
✔ 10 content idea captured, published on LinkedIn and its metrics (incl. 2 leads) recorded
✔ 11 finance: income, expense and an investment account with a balance recorded
✔ 12 weekly review completed
✔ 13 monthly report for 2026-11: sales "Cold calls 3", content "Published 1 / 0 planned …", PDF fiveyearos-report-2026-11-01-to-2026-11-10.pdf
✔ 14 five-year progress visible: Average outcome progress 7.5% / 2.2% planned …
page errors: none
```

Also exercised in browser tests during this release:
- **Sign-in lifecycle:** wrong password; QR enrolment; recovery codes; access-token expiry with refresh rotation for pages and API calls; sign-out invalidating the old refresh token; TOTP sign-in; recovery-code sign-in (10 → 9 left).
- **Analytics:** all ranges, monthly picker, CSV/PDF downloads.
- **PWA:** offline pages, queued actions, push subscription with a stubbed Push API.

## 4. Accessibility and performance (production build, phone emulation)

**axe-core, 26 pages:** /today, /checkin, /week, /habits, /goals, /goals/vision, /roadmap, /review, /advisor, /analytics, /sales, /sales/journal, /communication, /communication/assess, /psychology, /knowledge, /products, /content, /content/calendar, /content/analytics, /finance, /notifications, /settings, /settings/notifications, /settings/security, /login.
- Before the fixes: 10 violations.
- After: **0**.

**Performance** with 4× CPU slowdown and slow 4G (1.6 Mbps, 150 ms latency), on the seeded development account:

| Measure | Range across the 26 pages |
|---|---|
| Time to first byte | 7–37 ms (local server) |
| First contentful paint | 72–280 ms. 616 ms for the very first, cold load |
| Heading visible | 197–665 ms |
| Transferred | 43–276 KB |

The local server flatters time to first byte. On Vercel and Neon, expect added network latency per request, and database round trips from the Vercel region.

## 5. Backup and recovery

| Check | Result |
|---|---|
| `scripts/backup.sh` → `scripts/restore.sh` into an empty database | 77 tables, 1,333 rows: **identical** |
| Row-level security after restore | 71 tables, 284 policies: identical |
| Function ACL after restore | `app.claim_push_subscription` execute for `fyos_app` only: identical |
| Migration history after restore | 37 recorded: identical, so `db:migrate` continues normally |
| Encryption | Dump encrypted with `age`, plaintext shredded; decrypts to a readable archive with all 77 tables |
| App role on the restored database with no user set | Sees 0 rows (RLS) |

## 6. Not verified (needs your accounts or devices)

- **Vercel + Neon deployment.** Not deployed. All verification ran on a local production build with Postgres 16.
- **Web Push to a real phone.** Subscription, server sending, failure counting and gone-device removal are tested with a stubbed Push API and fake push services. No notification was received on a device.
- **iPhone / Safari.** Only Chromium was tested, emulating Android.
- **AI advisor.** Never answered with real Anthropic credentials (none here). The request path was verified up to a 401 from the API.
- **S3/R2 storage.** Recordings were tested with local storage in development. Production returns 503 until a bucket is configured.
- **GitHub workflows with secrets.** The Reminders and Backup workflows were not run on GitHub; their commands were run locally.
- **Pwned Passwords.** Not reachable from this sandbox. The CLI's fail-open warning path ran, and the k-anonymity request and response parsing are unit-tested.

## 7. Open items (low priority)

| Item | Impact | Suggested fix |
|---|---|---|
| The content form lists every format for every platform | Choosing an invalid one (e.g. Reel for LinkedIn) is refused on save with a clear message | Filter the format list by platform in the browser |
| No Content-Security-Policy for app pages (the service worker has one; frame, sniffing, referrer and permissions headers are set) | Less defence in depth against injected scripts. Tokens are HttpOnly regardless. | Nonce-based CSP via `proxy.ts` |
| 65 foreign keys without an index starting with their column (mostly `user_id`) | None for one owner (all rows share one `user_id`); slower account deletion | Add indexes before any multi-user use |
| No full raw-data export (docs/06 SEC-BK-04); reports export as CSV/PDF, and `scripts/backup.sh` dumps everything | You can't download all your raw records from the app itself | A Settings → Data JSON export per table |
| `npm audit`: 12 moderate advisories, all in development tools (drizzle-kit's bundled esbuild, typescript-eslint's minimatch) | Not in the deployed app | Update when upstream releases fixes |

## 8. Continuous integration

`.github/workflows/ci.yml` runs on every push to `main` and on pull requests:
- typecheck (after `next typegen`);
- lint;
- unit tests;
- database integration tests against a `postgres:16` service;
- `drizzle-kit check`;
- production build;
- the client-bundle secret check.

Its first run on GitHub **failed at typecheck**: in a clean checkout, Next's generated route types don't exist yet. `typecheck` now runs `next typegen` first, and that was verified from an empty `.next`.

**Second run: passed in 2 min 41 s** (run 42877215825 on `farhancc/tracking`, commit "CI: generate route types before tsc…"). All steps green: `npm ci`, typecheck, lint, unit tests, database tests on `postgres:16`, `db:check`, build, and the client-bundle secret check.

## 9. Defect log

| ID | Severity | Defect | Fix | Test |
|---|---|---|---|---|
| C1 | Critical | No production sign-in | Password + TOTP, refresh rotation, lockout, audit log, owner CLI | `auth.test.ts`, `auth-primitives.test.ts`, browser |
| H1 | High | Today's quick-add hidden behind the phone tab bar | Bar placed above the tab bar below 640 px | E2E step 5 overlap check |
| H2 | High | Duplicate default habits; crash on first Sales visit under concurrent requests | Advisory lock + `ON CONFLICT` | `concurrency.test.ts` (fails without the fix) |
| H3 | High | Clean-checkout typecheck fails (CI) | `next typegen` before `tsc` | CI, clean `.next` |
| H4 | High (design) | Restoring without privileges would widen a security-definer function | Restore keeps ACLs | Round trip (§5) |
| M1 | Medium | Empty PATCH → 500 on 18 endpoints | Mapped to 400 | `errors.test.ts`, sweep |
| M2 | Medium | Recording delete → 500 (missing id or no storage) | 404 first; 503 for configuration | Sweep |
| M3 | Medium | Weekly review completable with nothing written | Needs what you learned or what you'll change | `review.test.ts` |
| M4 | Medium | 10 accessibility violations (contrast, nested interactive, keyboard scrolling, empty header) | Ink colour tokens, list-based goal tree, focusable regions | axe: 0 on 26 pages |
| M5 | Medium | Auth tests flaky: order-dependent single-owner rule and TOTP step boundary | An owner is an account with a password; steps pinned | 3 full + 2 shuffled runs |
