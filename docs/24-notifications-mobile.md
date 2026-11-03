# 24. Mobile use, offline support and notifications

| | |
|---|---|
| **Status** | Implemented and tested: installable PWA, bottom navigation on phones, fast check-in, offline pages, queued actions, in-app inbox, reminder engine, preference centre, Web Push subscription and sending. **Push has not been received on a real phone in development.** Headless Chromium has no push service, so the browser test stubs the Push API, and the server's send to an unreachable endpoint was checked to fail cleanly. A first real delivery needs VAPID keys and a deployed HTTPS origin. |
| **Code** | `src/lib/domain/notifications.ts` · `src/db/schema/notifications.ts` · `drizzle/0033_notifications.sql`, `0034_notifications_rules.sql` · `src/features/notifications/**` · `src/app/api/cron/notifications` · `src/app/api/v1/notifications/**` · `public/sw.js` · `src/app/manifest.ts` · `src/app/icons/[file]` · `src/components/{mobile-nav,pwa,sign-out}.tsx` · `/checkin`, `/notifications`, `/settings/notifications` |
| **Configuration** | Optional: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (generate with `npm run push:keygen`) for push, and `CRON_SECRET` plus a scheduler for automatic reminders. With none of them set, the inbox still works and you can check for reminders by hand. |

## 1. Installable app

- `/manifest.webmanifest` (`src/app/manifest.ts`):
  - name, `start_url: /today`, `display: standalone`;
  - icons at 192, 512 and maskable 512, plus an Apple touch icon;
  - shortcuts to **Check-in**, **Today** and **Weekly review**.
- Icons are drawn by `ImageResponse` and rendered once at build time (`generateStaticParams`), so no binary files sit in the repo.
- Android and desktop Chrome offer **Install**. On iPhone, use Share → **Add to Home Screen**. iOS supports Web Push only for apps added to the Home Screen.

## 2. Phone layout

- **Bottom tab bar** (below 640 px): Today · Check-in · Week · Habits · More.
  - **More** opens a sheet with every section (Grow / Build / Plan) and Notification settings.
  - Tabs are at least 56 px tall, and the bar respects the iPhone safe area (`env(safe-area-inset-bottom)`).
  - The sheet closes on Escape, on the backdrop, or when you choose a link.
- The desktop top navigation is unchanged at `sm` and wider.
- The bell in the header shows the unread count. A **Skip to content** link is the first tab stop.
- No page scrolls sideways at 390 px; the browser tests check this.

## 3. Fast daily check-in (`/checkin`)

Every control needs one tap or one short field:

| Section | Action |
|---|---|
| Top priorities | Tap to complete or reopen each of today's three most important tasks. If none are set, a link to Today to pick them. |
| Other tasks today | Tap to complete; up to 8 are shown, then a link to the rest. |
| Habits | Tap = done; **Skip** = skipped (counts as not done, as on Today). |
| Quick capture | A one-line task added to today. |
| Reading | Minutes read; shows today's total. |

Each control is a plain Server Action form, so it works before JavaScript loads. It also retries after a dropped connection (§4).

## 4. Offline behaviour

The service worker (`public/sw.js`, registered only in production builds) caches:

| Request | Strategy |
|---|---|
| `/_next/static/*`, `/icons/*` | Cache first (hashed, immutable) |
| Page navigations | Network first; the last good copy is kept for offline use |
| Daily pages (`/today`, `/checkin`, `/week`, `/habits`, `/notifications`) | Refreshed in the background at most every 3 hours, so they open offline even if you reached them by in-app navigation |
| Anything else while offline | `/offline.html` |
| `/api/*`, `/login` | Never cached |

- **Signing out** clears the page cache, because cached pages contain personal data.
- **Queued actions.** `experimental.useOffline` is enabled in Next.js, and `useOffline()` drives the banner. A navigation or Server Action made without a connection waits and is sent when the connection returns. A banner says so: "You're offline. Saved pages still open; anything you submit will be sent when you're back online."
- **Cached pages show the state at the time they were cached.** They are not live.

## 5. Reminders

The reminder engine (`dueNotifications` in `src/lib/domain/notifications.ts`) is pure and runs in the user's own time zone. A reminder is created only when there is something to act on:

| Reminder | Default | Condition | Dedupe key |
|---|---|---|---|
| Daily planning | 07:30 | Today's three most important tasks aren't all set | `daily_planning:<date>` |
| Task deadlines | 08:00 | Open tasks due today or overdue | `task_deadlines:<date>` |
| Weekly review | Fri 17:00 | This week isn't reviewed | `weekly_review:<week start>` |
| Monthly review | 17:00, last day of the month | Always on that day | `monthly_review:<yyyy-mm>` |
| Habits | 20:00 | Habits still open today (scheduled, or weekly ones under target; rest days are excused) | `habits:<date>` |
| Goal milestones | When it happens | A goal achieved in the last 3 days; a goal due within 7 days whose health is *at risk* or *off track* | `goal_achieved:<id>`, `goal_due_soon:<id>:<date>` |

- **Timing.** A reminder fires at the first run at or after its time on its day. It does not fire on a later day to catch up.
- **Dedupe.** The dedupe key is unique per user, so repeated runs never create duplicates.
- Reminders reflect activity, not outcomes. They point you to the planning and review screens, where outcomes are judged.

### Running reminders

- **Automatic:** call `GET /api/cron/notifications` every 15 minutes with `Authorization: Bearer $CRON_SECRET`:
  - each user runs in their own RLS transaction;
  - one user's failure doesn't stop the others;
  - the response gives counts: `{users, created, pushed, failed, push}`;
  - the secret is compared in constant time; the route returns 503 without a secret and 401 with a wrong one.
  - Example: a GitHub Actions schedule or a system cron calling `curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/notifications`. Vercel Cron also sends this header. On Vercel's Hobby plan cron runs at most once a day, so use another scheduler or a paid plan for 15-minute runs.
- **By hand:** **Check for reminders now** on `/notifications`, or `POST /api/v1/notifications/run`.

## 6. Inbox and push

- **The inbox is the record.** Every reminder lands in it, whether or not push works.
  - Opening an item marks it read and goes to its link (an in-app path only).
  - **Mark all read** clears the badge.
  - Each item shows whether it was pushed. If it wasn't, it says why: push not configured, push off, quiet hours, no device subscribed, or the push service's error.
- **Push** uses Web Push with VAPID (`web-push` 3.6.7).
  - `PushSetup` (client) checks support, asks permission, subscribes with the public key, and posts the subscription. It explains every case where push can't work:
    - the browser has no support;
    - iOS when the app isn't installed;
    - permission was blocked;
    - the server has no keys;
    - the service worker isn't running.
  - On each visit it re-sends an existing subscription (idempotent), so the server's copy stays current.
- **Delivery** (`deliver()` in the service):
  - Devices the push service reports gone (404/410) are deleted and skipped for the rest of the run.
  - Other failures are counted on the device and shown in settings.
  - A successful send resets the count.
- A subscription endpoint belongs to one user at a time. `app.claim_push_subscription()`, a security-definer function, moves a shared browser's endpoint to whoever signed in and subscribed last, so one person's reminders never reach another person's account on that browser.

## 7. Preference centre (`/settings/notifications`)

- Each reminder: on/off and a time; the weekly review also has a day. Milestones have no time.
- Quiet hours (wrapping midnight is allowed). During quiet hours items still go to the inbox; they just aren't pushed.
- **Push to my devices**: off means inbox only.
- **This device**: enable or disable push; list of devices with added date, last delivery and failures; remove a device.
- **Send a test notification**: adds an item to the inbox and pushes it to every device, reporting *pushed to N of M devices*.

## 8. API

| Method | Path | Body / result |
|---|---|---|
| GET | `/api/v1/notifications` | `{items, unread}` |
| POST | `/api/v1/notifications/read` | `{id: uuid \| "all"}` |
| GET / PUT | `/api/v1/notifications/preferences` | The full preference object (validated; times `HH:MM`) |
| GET / POST / DELETE | `/api/v1/notifications/subscriptions` | POST a `PushSubscription.toJSON()` (https endpoint only); DELETE `{endpoint}` |
| POST | `/api/v1/notifications/test` | `{delivered, devices}` |
| POST | `/api/v1/notifications/run` | `{created, pushed}` for the signed-in user |
| GET / POST | `/api/cron/notifications` | Bearer `CRON_SECRET`; all users |

## 9. Accessibility and speed

- **Accessibility.**
  - axe-core (WCAG 2 A/AA + best practice) reports no violations on `/today`, `/checkin`, `/notifications` and `/settings/notifications` at 390 px.
  - Fixes made for this:
    - the light-mode `--success` colour was darkened from `oklch(0.6 …)` to `oklch(0.53 0.15 155)`, raising contrast from 3.7:1 to 4.8:1 on white;
    - card titles are now `h2` (previously `h3` straight after the page's `h1`);
    - the loading skeleton has `role="status"`.
  - Every toggle has an `aria-pressed` state and a spoken label. The offline banner is a live region.
- **Speed.**
  - Pages are static shells with streamed data (Partial Prerendering), so the frame and navigation paint at once.
  - Build assets are cached by the service worker.
  - The service worker never caches personal API responses.

## 10. Tests

- **Unit** (`src/lib/domain/notifications.test.ts`): local time and weekday across time zones, quiet hours wrapping midnight, the last day of the month, and which reminders are due and when.
- **Integration** (`tests/integration/notifications.test.ts`, real Postgres and RLS):
  - each reminder is created once, even over repeated runs;
  - live devices are pushed to;
  - a gone device is removed after its first failure and not tried again;
  - read state and unread counts;
  - done tasks don't remind;
  - without push the item still lands in the inbox with a note;
  - users can't see each other's notifications;
  - quiet hours and switched-off reminders;
  - an endpoint moves between users;
  - test sends;
  - a failing device is counted and its error shown.
- **Browser** (`next build && next start`, Playwright, 390 × 844 and 1280 × 800):
  - manifest, icons, service worker active and controlling the page, daily pages warmed;
  - bottom navigation, the More sheet (Escape, closes on navigation), no sideways scroll;
  - check-in: capture → complete, reading total updates;
  - preferences save and persist;
  - push enable with a stubbed Push API sends a 65-byte VAPID key, the device is listed, a failed send is counted, and turning push off removes it;
  - a test notification shows the bell badge, and opening it marks it read;
  - offline: a cached page opens, a warmed page opens without ever having been loaded as a document, unknown pages show the offline page, the banner appears, and a tap made offline is applied after reconnecting;
  - cron: 503/401/200 and dedupe;
  - API validation.

## 11. Limits

- No real push delivery has been observed yet (see Status).
- Cached pages can be stale until you're back online.
- Without a scheduler, reminders appear only when you press **Check for reminders now**.
- Times are checked at run time, so a 15-minute schedule means a reminder arrives up to 15 minutes after its set time.
