# 26. Deployment, configuration, migrations and backups

| | |
|---|---|
| **Target** | Vercel (Node.js runtime) + Neon Postgres, as chosen in [ADR-001](adr/ADR-001-jwt-auth-and-neon.md). Any Node.js 20.9+ host with Postgres 16+ works the same way (`npm run build && npm start`). |
| **Status** | **Verified here:** every step below on a local Postgres 16 with `next build && next start`. The production build also succeeds with no environment at all, as CI runs it. **Not yet done:** an actual Vercel + Neon deployment, which needs your accounts. |

## 1. What you need

- A **Neon** project (Postgres 16 or 17). Pick the region nearest to you and to the Vercel region.
- A **Vercel** project connected to this GitHub repository.
- Node.js 22 and `psql` on your computer, for migrations and the owner CLI.
- **Optional:**
  - an S3-compatible bucket (Cloudflare R2, AWS S3, MinIO) for audio recordings;
  - an Anthropic API key for the AI advisor.

## 2. Database setup (once)

1. In Neon, note two connection strings for the owner role (`neondb_owner`): the **direct** one and the **pooled** one (`-pooler` in the host).
2. Run the migrations from your computer with the **direct** URL. They create the `fyos_app` and `fyos_auth` group roles, the schemas, every table, row-level security and triggers.

   ```bash
   MIGRATION_DATABASE_URL='postgres://neondb_owner:…@ep-….neon.tech/neondb?sslmode=require' npm run db:migrate
   ```

3. Create the two **login** roles the app connects as. Generate the passwords (for example with `openssl rand -base64 30`) and keep them in a password manager.

   ```sql
   create role fyos_app_login  login password '<generated-1>' in role fyos_app;
   create role fyos_auth_login login password '<generated-2>' in role fyos_auth;
   ```

4. Build the runtime URLs on the **pooled** host, for example `postgres://fyos_app_login:<generated-1>@ep-…-pooler.….neon.tech/neondb?sslmode=require`.

**Migrations are files in `drizzle/`, applied in order** (0000 → 0036 today). `drizzle.__drizzle_migrations` records which have run, so `npm run db:migrate` is safe to re-run and applies only new ones. For a new version of the app:

1. Take a backup or a Neon branch (§6).
2. Run `npm run db:migrate` with the direct URL.
3. Deploy the code.

Migrations are written to be additive, so the old code keeps working while they run.

## 3. Environment variables

| Variable | Required | Where | What it is / how to make it |
|---|---|---|---|
| `DATABASE_URL` | yes | Vercel | Pooled URL as `fyos_app_login`. All app data goes through it, under RLS. |
| `AUTH_DATABASE_URL` | yes | Vercel, your computer (owner CLI) | Pooled URL as `fyos_auth_login`. Only `src/lib/auth` uses it. |
| `AUTH_JWT_PRIVATE_JWK` | yes | Vercel | ES256 signing key. `npm run auth:keygen` prints it. |
| `AUTH_JWT_PUBLIC_JWKS` | yes | Vercel | Matching public key set (current + previous during rotation). From `auth:keygen`. |
| `AUTH_ENCRYPTION_KEY` | yes | Vercel | 32 random bytes, base64. Encrypts the authenticator secret. From `auth:keygen`. Back it up offline: losing it means `owner:reset`. |
| `AUTH_JWT_ISSUER`, `AUTH_JWT_AUDIENCE` | no | Vercel | Defaults `fiveyearos` / `fiveyearos-app`. |
| `CRON_SECRET` | for reminders | Vercel + GitHub secret | Random string (`openssl rand -base64 32`). The reminder job must send it as a Bearer token. |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | for push | Vercel | `npm run push:keygen`. Without them, reminders still go to the in-app inbox. Changing them invalidates existing push subscriptions. |
| `VAPID_SUBJECT` | for push | Vercel | `mailto:` address push services can contact. |
| `STORAGE_DRIVER` | for recordings | Vercel | `s3` in production (`local` works only in development). Without it, recording upload and playback answer 503 and the rest of the app works. |
| `STORAGE_S3_ENDPOINT`, `STORAGE_S3_REGION`, `STORAGE_S3_BUCKET`, `STORAGE_S3_ACCESS_KEY_ID`, `STORAGE_S3_SECRET_ACCESS_KEY` | with `s3` | Vercel | Private bucket. R2: endpoint `https://<account>.r2.cloudflarestorage.com`, region `auto`. |
| `ANTHROPIC_API_KEY` | for the advisor | Vercel | Without it, `/advisor` says it is off. |
| `MIGRATION_DATABASE_URL` | for migrations/backups | your computer, GitHub secret | **Direct** URL as the owner role. Never set it on Vercel. |
| `FYOS_DEV_LOGIN`, `FYOS_DEV_EMAIL` | development only | `.env.local` | Ignored by production builds. |
| `TEST_ADMIN_DATABASE_URL` | tests only | `.env.local`, CI | A role that can create databases and roles. |

- **Public values.** Only `NEXT_PUBLIC_*` reaches the browser. `scripts/check-client-bundle.sh` runs in CI and fails if a server variable's name, or its value when set, appears in the browser bundles.
- **Locally,** copy `.env.example` to `.env.local` and fill it in.

## 4. Deploy to Vercel

1. Import the repository. The defaults are right: Next.js, `npm run build`, Node 22.
2. Add the variables from §3 under **Production** (and **Preview** if you use previews, with a separate Neon branch).
3. Deploy. The first page you open redirects to `/login`.
4. **Create the owner account** from your computer. There is no sign-up page.

   ```bash
   AUTH_DATABASE_URL='postgres://fyos_auth_login:…-pooler…' npm run owner:create -- you@example.com
   ```

   It asks for the password twice, without echoing it. The password needs 12+ characters, and the CLI checks it against known breaches with the Pwned Passwords k-anonymity API.
5. **Sign in** at `https://<your-app>/login`:
   - scan the QR code with an authenticator app;
   - enter one code;
   - **save the 10 recovery codes**.
6. **Phone:** open the site in Chrome on Android and choose **Install app**. On iPhone, use Share → Add to Home Screen. Then turn on push in Settings → Notifications.

## 5. Scheduled jobs

| Job | How | Notes |
|---|---|---|
| Reminders (`GET /api/cron/notifications`, every 15 min) | `.github/workflows/reminders.yml`. Set the repository **variable** `APP_URL` and the **secret** `CRON_SECRET`. Until `APP_URL` is set it does nothing. | Vercel Cron also works (it sends `Authorization: Bearer $CRON_SECRET`), but the Hobby plan allows one run a day. GitHub's scheduler can run a few minutes late. Each reminder is created at most once (dedupe keys). |
| Backups (daily 02:17 UTC) | `.github/workflows/backup.yml`. Set the variable `BACKUP_ENABLED=true` and the secrets `MIGRATION_DATABASE_URL` (direct, owner) and `BACKUP_AGE_RECIPIENT`. | See §6. |

## 6. Backup and recovery

| Layer | What | Recovery point |
|---|---|---|
| Neon point-in-time restore | Built into Neon (history window depends on the plan) | Seconds, within the window |
| Daily encrypted dump | `backup.yml`: `pg_dump` (custom format, all schemas including `auth`) → encrypted with `age` → GitHub artifact kept 90 days, outside Neon | ≤ 24 h, even if Neon is lost |
| Manual dump | `BACKUP_DATABASE_URL=<direct owner URL> scripts/backup.sh` | Whenever you run it |

**Setting up the encrypted backups:**

1. Run `age-keygen -o fiveyearos-backup.key` on your computer. It prints the public key (`age1…`).
2. Put the public key in the `BACKUP_AGE_RECIPIENT` secret.
3. Store `fiveyearos-backup.key` offline (for example a password manager or a USB key). Without it the backups can't be read.
4. Store `AUTH_ENCRYPTION_KEY` the same way.

**Restoring:**

1. **Neon first.** Create a branch at the moment before the problem, check it, then point `DATABASE_URL` and `AUTH_DATABASE_URL` at it, or promote it.
2. **From a dump:**
   1. Download the artifact from the Backup workflow run.
   2. Decrypt it: `age -d -i fiveyearos-backup.key -o restore.dump <file>.dump.age`.
   3. Create an **empty** database (a new Neon branch or project).
   4. Run `RESTORE_DATABASE_URL=<owner URL of the empty db> scripts/restore.sh restore.dump`.
   5. Re-create the two login roles (§2.3) if it's a new project.
   6. Point the app at it.

   The restore keeps every grant, revoke, row-level-security policy and the migration history, so `db:migrate` continues from where the backup was.
3. **Test a restore every quarter** into a scratch database and compare row counts.

**Verified here:**
- **Round trip.** `backup.sh` → `restore.sh` into an empty database matched exactly: 77 tables and 1,333 rows; 71 tables with RLS and all 284 policies; the restricted ACL on `app.claim_push_subscription`; and 37 recorded migrations.
- **Encryption.** The dump was encrypted with `age`, the plaintext shredded, and it decrypted to a readable archive with all 77 tables.
- **Not yet run:** the GitHub workflow itself on GitHub, which needs the secrets.

## 7. Key rotation (yearly, or after any suspected leak)

| Secret | How |
|---|---|
| JWT signing key | 1. Run `npm run auth:keygen`.<br>2. Add the new public key to `AUTH_JWT_PUBLIC_JWKS` next to the old one and deploy.<br>3. Switch `AUTH_JWT_PRIVATE_JWK` and deploy.<br>4. After 15 minutes (one access-token lifetime), remove the old public key. |
| `AUTH_ENCRYPTION_KEY` | 1. Set the new key.<br>2. Run `npm run owner:reset -- <email>`.<br>3. Set up the authenticator again at next sign-in. |
| Database role passwords | `alter role fyos_app_login password '…'`, then update the URLs on Vercel and redeploy. |
| `CRON_SECRET`, VAPID keys, storage keys | Replace the values on Vercel and in GitHub. After changing VAPID keys, re-enable push on each device. |

## 8. Recovering access to your account

| Lost | Do |
|---|---|
| Phone (authenticator) | Sign in with a recovery code. Then go to Settings → Security, create new recovery codes, and set up the authenticator again (`owner:reset` removes the old one). |
| Phone **and** recovery codes | From your computer, run `AUTH_DATABASE_URL=… npm run owner:reset -- you@example.com`. It sets a new password, removes the authenticator and signs out every device. |
| Password | Same as above: `owner:reset`, or `owner:create` (which keeps the authenticator). There are no email resets, by design. |
