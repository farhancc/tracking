# 28. Production deployment checklist

Tick each line before calling a deployment live. Each line names how to check it. Items marked ✅ were verified for this release in development (see [docs/27](27-testing-report.md)); the rest can only be done on your accounts.

## Before the first deployment

- [ ] **Neon project created.** Migrations applied with the direct URL: `npm run db:migrate` reports "Migrations applied." (✅ locally)
- [ ] **Login roles exist.** `fyos_app_login` (member of `fyos_app`) and `fyos_auth_login` (member of `fyos_auth`) have generated passwords stored in a password manager. (docs/26 §2)
- [ ] **Secrets generated.** `npm run auth:keygen` (JWT keys + `AUTH_ENCRYPTION_KEY`), `npm run push:keygen` (VAPID), `openssl rand -base64 32` (`CRON_SECRET`).
- [ ] **Offline copies.** `AUTH_ENCRYPTION_KEY` and the backup `age` private key are stored offline, separately from the database.
- [ ] **Vercel variables.** Every required variable from docs/26 §3 is set for Production. `MIGRATION_DATABASE_URL` is **not** set on Vercel.
- [ ] **Development sign-in can't run.** `FYOS_DEV_LOGIN` is not set. Production builds ignore it anyway. (✅ `devLoginEnabled()` requires `NODE_ENV=development`)
- [ ] **Storage.** For recordings, a private S3/R2 bucket with `STORAGE_DRIVER=s3` and its keys. Without it, recordings answer 503 and the rest works. (✅ behaviour checked)

## Deploy

- [ ] **CI is green** on the commit being deployed (typecheck, lint, unit, database, migration check, build, client-bundle secret check).
- [ ] **Deployed.** Opening the app redirects to `/login`. `curl -I https://<app>/today` returns 307 to `/login?next=…`. (✅ locally)
- [ ] **Owner created** with `npm run owner:create -- <email>`, with no breach warning (Pwned Passwords is reachable from your computer).
- [ ] **First sign-in done:** authenticator enrolled, 10 recovery codes saved. Test **one** recovery code later and regenerate the set.
- [ ] **Journey set up:** Day 1, currency and time zone correct on Today.

## Security

- [ ] `https://<app>` serves HSTS. Vercel does this by default for its domains; set it for custom domains.
- [ ] **Security headers present:** `curl -I` shows `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`/frame-ancestors and `Permissions-Policy`. (✅ `next.config.ts`)
- [ ] **Cross-origin requests refused:** a POST from another origin to `/api/auth/login` gets 403. (✅ `authPost` same-origin check)
- [ ] **No tokens readable by JavaScript:** in DevTools → Application → Cookies, `__Host-fyos_at` and `__Host-fyos_rt` are HttpOnly, Secure, SameSite=Lax. (✅ browser test)
- [ ] **Lockout and refresh checked against production:**
  - 5 wrong passwords lock sign-in for a minute;
  - Settings → Security lists the events;
  - **Sign out everywhere** returns every device to `/login`. (✅ integration + browser)
- [ ] **`npm audit` has no high or critical issues.** Today it reports 12 moderate, all in development tools (drizzle-kit's bundled esbuild, typescript-eslint's minimatch), none in the runtime bundle.

## Operations

- [ ] **Reminders:** repository variable `APP_URL` and secret `CRON_SECRET` set. Run the **Reminders** workflow by hand once; it returns `{"data":{"users":1,…}}`.
- [ ] **Push:**
  - on your phone, Settings → Notifications → Enable push → Send a test notification arrives;
  - the device list shows "last delivered".
  - Not yet verified on a real device; see docs/27 §6.
- [ ] **Backups:**
  - `BACKUP_ENABLED=true`, secrets `MIGRATION_DATABASE_URL` and `BACKUP_AGE_RECIPIENT` set;
  - run the **Backup** workflow by hand: an `.age` artifact appears;
  - decrypt it and `pg_restore --list` it on your computer. (✅ the same steps locally)
- [ ] **Neon:** the point-in-time restore window is long enough for you (a paid plan before real data).
- [ ] **Restore drill:** restore the latest dump into a new Neon branch with `scripts/restore.sh` and compare row counts. Repeat quarterly. (✅ locally: identical)
- [ ] **AI advisor** (optional): `ANTHROPIC_API_KEY` set. `/advisor` answers a question, and its facts match your data. Not yet exercised with real credentials.

## After each release

- [ ] **Migrations first:** backup or branch, then `npm run db:migrate`, then deploy.
- [ ] **End-to-end test against a staging deployment** with a fresh owner: `npm run test:e2e` reports 15 ✔ (steps 0–14).
- [ ] **Changes to `src/lib/auth`** pass `tests/integration/auth.test.ts` and `src/lib/auth/auth-primitives.test.ts` (docs/06 §10).
- [ ] **Accessibility and layout:** no new axe violations and no horizontal scrolling at 390–412 px on the pages you changed (method in docs/27 §1 and §4: axe-core with WCAG 2.0/2.1 A/AA rules on a phone-sized viewport).
