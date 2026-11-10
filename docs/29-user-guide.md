# FiveYearOS user guide

FiveYearOS turns a five-year vision into this week's work and today's three most important tasks. It then checks whether that work is moving the outcomes you care about.

The guide is in the order you'll meet things: first day, every day, every week, every month.

## 1. First day

1. **Sign in** at your app's address.
   1. The first time, scan the QR code with an authenticator app (Google Authenticator, 1Password, Aegis…).
   2. Enter the 6-digit code.
   3. **Save the 10 recovery codes**: download them or copy them into a password manager. Each code signs you in once if you lose your phone.
2. **Set up your journey** on Today: Day 1, your currency, time zone and the day your week starts. The journey runs five years from Day 1.
3. **Write your vision** (Plan → Vision). Saving again keeps the old version, so you can see how your thinking changed.
4. **Add your five-year goals** (Plan → Goals → New goal). Each goal needs:
   - a **success metric and a target number**: "Monthly product profit: 200,000", not "grow the business";
   - a pillar (sales, product, branding, finance…).
5. **Break them down.** On a goal, choose **+ Annual**, then **+ Quarterly** under that, and so on. Key results are the measurable pieces of an objective.
6. **Install it on your phone.**
   - Android (Chrome): menu → **Install app**.
   - iPhone (Safari): Share → **Add to Home Screen**. iPhone push notifications work only from the installed app.

## 2. Every day (2–5 minutes)

Open **Check-in** (the second tab on your phone):

- **Top priorities.** Tap to mark each of today's three most important tasks done. If none are set, the link takes you to Today to pick them.
- **Other tasks.** One tap to complete.
- **Habits.** One tap when done; **Skip** if you didn't. A skip counts as not done. Rest days are excused.
- **Quick capture.** A one-line task for today, and the minutes you read.

**Today** is the full plan:
- the year → quarter → week goals the day serves;
- your three priorities;
- **Start / Finish** timing for each task;
- **Pull from this week** to schedule planned work;
- overdue tasks;
- the evening **reflection**: what you accomplished, learned, what went wrong, and what to improve.

The **progress ring** weights your three priorities (50%), other planned work by estimated time (30%) and habits (20%). Ten small tasks can't outweigh one important one.

## 3. Every week

**Week** (third tab):
- add **weekly goals**, each tied to a monthly, quarterly or annual objective (no orphan goals);
- add tasks under each goal, with estimates;
- carry unfinished tasks forward. A task carried twice is highlighted, because it usually means it's too big or not really wanted.

The **weekly scorecard** is 60% weekly-goal outcomes plus 40% deliverables. **The number of tasks never raises the score.**

**Weekly review** (Plan → Weekly review, best at the end of the week):

1. Read the report by pillar and the data-based observations.
2. Answer the questions. Completing needs at least what you learned or what you'll change, plus a reason for each missed goal.
3. Approve suggested goals for next week, or use "what I'll change" as next week's focus.

Completing the review freezes the week's numbers.

## 4. Every month

**Analytics** (Plan → Analytics):
- **Monthly report** picks a calendar month.
- **PDF** downloads a printable report; **CSV** gives the same figures for a spreadsheet.
- Other ranges: 7 days, 30 days, 90 days, 1 year, the whole journey.

What to look at:

- **"Is activity turning into outcomes?"**
  - Each area compares effort (calls, posts, practice, features) with results (meetings, leads, level gained, customers), against the previous period of the same length.
  - "Activity without a measurable outcome" means you're busy but it isn't paying off yet.
  - It shows correlation, not cause.
- **Planned vs actual.** Planned is only what you set: goal pace, targets, scheduled posts, forecasts. A dash means you set nothing to compare against. Nothing is invented.
- **Five-year progress.** Where each goal stood on each date, rebuilt from the measurements you logged.

Also once a month:
- log a measurement on goals that don't update themselves (goal page → Log measurement);
- reassess communication skills (Speak → Monthly assessment).

## 5. The areas

| Area | What you do there | What counts |
|---|---|---|
| **Sales** (Grow → Sales) | One-tap call outcomes, activities, prospects, deals, targets; a journal of objections and what worked | Meetings, deals won and revenue, against your targets |
| **Speak** | Daily exercises (record or write), practice log, assessments with evidence | Assessed level (1–10). Practice alone never raises it. |
| **Psychology** | Concepts with evidence levels, spaced-repetition reviews, real-world applications | "Understood deeply" needs 3 good recalls **and** a real application with a result |
| **Knowledge** | Books and courses, reading sessions, concepts, applications | Applied ideas, not pages read |
| **Products** | Each product's stage, validation evidence, milestones, releases, revenue, monthly MRR and customers | Demand evidence and revenue; recommendations come from fixed rules, with reasons |
| **Content** | Ideas → script → recording → published; metrics per post; audience snapshots | Leads and trust signals, not views |
| **Finance** | Income, expenses, accounts and balances, forecasts | Savings rate and progress to your financial-independence target. Forecasts are kept apart from actuals. |
| **Habits** | Fixed-day or "N times a week" habits, rest days | Consistency; streaks ignore rest days |
| **Roadmap** | Year and quarter plans, deliverables, KPIs, risks, dependencies | Delivered vs planned, and objective progress |
| **Advisor** | Ask about your own data | Only shown if the server has an Anthropic key. Every number it states is checked against your data. It never changes goals or deletes anything without your confirmation. |

## 6. Notifications

Settings (gear icon, or More → Settings) → **Notifications**:
- turn each reminder on or off and set its time: daily planning, deadlines, weekly review, monthly review, habits, goal milestones;
- set quiet hours;
- **Enable push on this device**, then **Send a test notification** to check it.

Every reminder also lands in the **bell** inbox, so nothing is lost if push is off. A reminder is sent only when there's something to act on, at most once.

## 7. Offline

- **Pages you've opened** still open without a connection; Today, Check-in, Week, Habits and Notifications are kept ready. They show the last saved state.
- **Taps and forms made offline** wait and are sent automatically when you're back online. A banner tells you you're offline.

## 8. Account and security

**Settings → Security:**
- the devices signed in, each with **Revoke**;
- **Sign out everywhere**;
- **change password** (needs your current password and a code);
- **new recovery codes**;
- recent sign-in activity.

**Signing out** also clears pages saved on that device.

After 5 wrong attempts, sign-in locks for 1 minute, and longer if it continues. It unlocks on its own.

**Lost something?**

| Lost | Do |
|---|---|
| Phone | Sign in with a recovery code, then create new codes in Settings → Security. |
| Phone **and** recovery codes, or the password | Run `npm run owner:reset -- you@example.com` from the project on your computer (docs/26 §8). It sets a new password and lets you set up the authenticator again. |

## 9. When something looks wrong

| You see | Why / what to do |
|---|---|
| A goal is "Off track" right after you created it | Health compares progress with time elapsed. Log a measurement when the number moves. |
| "Say why each missed goal was missed" | Pick a reason for each missed weekly goal before completing the review. |
| "Pick a platform and format" / "Reel isn't a LinkedIn format" | Each platform has its own formats. Choose one that fits. |
| Push says "blocked" | Allow notifications for the site in the browser's settings, then reload. On iPhone, open the installed app. |
| Advisor says it's off | The server has no Anthropic API key. Everything else works. |
| Recording upload fails with "storage isn't configured" | The server needs `STORAGE_DRIVER=s3` and a bucket (docs/26 §3). Written practice still works. |
