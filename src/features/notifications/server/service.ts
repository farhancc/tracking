/**
 * Notifications: preferences, push subscriptions, the inbox, and the reminder
 * run that turns due reminders into inbox items and (where possible) pushes.
 */
import { and, count, desc, eq, gte, inArray, isNull, lt, lte, notInArray, sql } from "drizzle-orm";
import type { Tx } from "@/db/drizzle";
import { goals, habitCheckins, habits, notificationPreferences, notifications, pushSubscriptions, restDays, tasks, weekPlans, weekReviews } from "@/db/schema";
import { decorateGoal, getWorkspace } from "@/features/goals/server/service";
import { addDays } from "@/lib/domain/dates";
import { weekday as weekdayOf } from "@/lib/domain/habits";
import { DEFAULT_PREFERENCES, dueNotifications, inQuietHours, localNow, type DueInput, type Preferences } from "@/lib/domain/notifications";
import { weekOf } from "@/lib/domain/weekly";
import { notFound } from "@/lib/errors";

export async function getPreferences(tx: Tx): Promise<Preferences> {
  const [row] = await tx.select().from(notificationPreferences).limit(1);
  return { ...DEFAULT_PREFERENCES, ...(row?.prefs ?? {}) };
}

export async function savePreferences(tx: Tx, prefs: Preferences) {
  await tx.insert(notificationPreferences).values({ prefs }).onConflictDoUpdate({ target: notificationPreferences.userId, set: { prefs } });
  return prefs;
}

export async function subscribe(tx: Tx, sub: { endpoint: string; keys: { p256dh: string; auth: string } }, userAgent: string | null) {
  await tx.execute(sql`select app.claim_push_subscription(${sub.endpoint}, ${sub.keys.p256dh}, ${sub.keys.auth}, ${userAgent})`);
  return { subscribed: true };
}

export async function unsubscribe(tx: Tx, endpoint: string) {
  await tx.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
  return { subscribed: false };
}

export async function removeSubscription(tx: Tx, id: string) {
  const [row] = await tx.delete(pushSubscriptions).where(eq(pushSubscriptions.id, id)).returning({ id: pushSubscriptions.id });
  if (!row) throw notFound("Device");
}

export async function listSubscriptions(tx: Tx) {
  return tx.select({ id: pushSubscriptions.id, userAgent: pushSubscriptions.userAgent, createdAt: pushSubscriptions.createdAt, lastSuccessAt: pushSubscriptions.lastSuccessAt, failures: pushSubscriptions.failures }).from(pushSubscriptions);
}

export async function listInbox(tx: Tx, limit = 50) {
  return tx.select().from(notifications).orderBy(desc(notifications.createdAt)).limit(limit);
}

export async function unreadCount(tx: Tx) {
  const [{ n }] = await tx.select({ n: count() }).from(notifications).where(isNull(notifications.readAt));
  return n;
}

export async function markRead(tx: Tx, id: string | "all") {
  if (id === "all") {
    await tx.update(notifications).set({ readAt: new Date() }).where(isNull(notifications.readAt));
    return { ok: true };
  }
  const [row] = await tx.update(notifications).set({ readAt: new Date() }).where(eq(notifications.id, id)).returning({ id: notifications.id });
  if (!row) throw notFound("Notification");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// The reminder run

const OPEN = ["todo", "doing"] as const;

export async function gatherDueInput(tx: Tx, at: Date): Promise<(DueInput & { timezone: string }) | null> {
  const ws = await getWorkspace(tx);
  if (!ws.journey) return null;
  const timezone = ws.profile?.timezone ?? "UTC";
  const now = localNow(timezone, at);
  const today = now.date;
  const prefs = await getPreferences(tx);
  const [{ mits }] = await tx.select({ mits: count() }).from(tasks).where(and(eq(tasks.mitOn, today), isNull(tasks.archivedAt)));
  const [{ due }] = await tx.select({ due: count() }).from(tasks).where(and(eq(tasks.dueOn, today), inArray(tasks.status, [...OPEN]), isNull(tasks.archivedAt)));
  const [{ overdue }] = await tx.select({ overdue: count() }).from(tasks).where(and(lt(tasks.dueOn, today), inArray(tasks.status, [...OPEN]), isNull(tasks.archivedAt)));
  const week = weekOf(today, ws.weekStartsOn).weekStart;
  const [review] = await tx.select({ completedAt: weekReviews.completedAt }).from(weekReviews).where(eq(weekReviews.weekStart, week)).limit(1);
  const [plan] = await tx.select({ reviewedAt: weekPlans.reviewedAt }).from(weekPlans).where(eq(weekPlans.weekStart, week)).limit(1);

  // Habits still open today: scheduled today (or weekly ones under target), not checked in, not a rest day.
  let habitsOpen = 0;
  const [rest] = await tx.select({ day: restDays.day }).from(restDays).where(eq(restDays.day, today)).limit(1);
  if (!rest) {
    const list = await tx.select().from(habits).where(and(isNull(habits.archivedAt), lte(habits.startedOn, today)));
    const checked = new Set(
      list.length ? (await tx.select({ habitId: habitCheckins.habitId }).from(habitCheckins).where(and(eq(habitCheckins.checkinOn, today), inArray(habitCheckins.habitId, list.map((h) => h.id))))).map((r) => r.habitId) : [],
    );
    for (const h of list) {
      if (checked.has(h.id)) continue;
      if (h.scheduleKind === "days" && h.scheduleDays.includes(weekdayOf(today))) habitsOpen += 1;
      if (h.scheduleKind === "weekly") {
        const [{ n }] = await tx.select({ n: count() }).from(habitCheckins).where(and(eq(habitCheckins.habitId, h.id), eq(habitCheckins.status, "done"), gte(habitCheckins.checkinOn, week), lte(habitCheckins.checkinOn, today)));
        if (n < (h.weeklyTarget ?? 1)) habitsOpen += 1;
      }
    }
  }

  const achieved = await tx
    .select({ id: goals.id, title: goals.title })
    .from(goals)
    .where(and(eq(goals.status, "achieved"), isNull(goals.archivedAt), gte(goals.updatedAt, sql`now() - interval '3 days'`)));
  const soon = await tx
    .select()
    .from(goals)
    .where(and(isNull(goals.archivedAt), gte(goals.targetDate, today), lte(goals.targetDate, addDays(today, 7)), notInArray(goals.status, ["achieved", "missed", "abandoned"]), notInArray(goals.level, ["weekly"])));
  const behind = soon
    .map((g) => decorateGoal(g, today))
    .filter((g) => g.health === "at_risk" || g.health === "off_track")
    .map((g) => ({ id: g.id, title: g.title, targetDate: g.targetDate, progressPct: Math.round(g.completionPct ?? 0) }));

  return {
    timezone,
    now,
    prefs,
    mitsSetToday: mits,
    tasksDueToday: due,
    tasksOverdue: overdue,
    weekReviewed: Boolean(review?.completedAt || plan?.reviewedAt),
    habitsOpenToday: habitsOpen,
    achievedGoals: achieved,
    behindGoalsDueSoon: behind,
  };
}

export type PushPayload = { title: string; body: string; url: string; tag: string };
export type PushResult = { ok: true } | { ok: false; gone: boolean; error: string };
export type PushSender = (sub: { endpoint: string; p256dh: string; auth: string }, payload: PushPayload) => Promise<PushResult>;

/** Creates due notifications (once each) and pushes them unless push is off, unconfigured or in quiet hours. */
export async function runForUser(tx: Tx, at: Date, sender: PushSender | null) {
  const input = await gatherDueInput(tx, at);
  if (!input) return { created: 0, pushed: 0 };
  const due = dueNotifications(input);
  if (!due.length) return { created: 0, pushed: 0 };
  const created = await tx.insert(notifications).values(due).onConflictDoNothing({ target: [notifications.userId, notifications.dedupeKey] }).returning();
  if (!created.length) return { created: 0, pushed: 0 };

  const note = !sender ? "Push isn't configured on the server." : !input.prefs.push ? "Push is off in your preferences." : inQuietHours(input.now.time, input.prefs.quietStart, input.prefs.quietEnd) ? "Quiet hours." : null;
  const subs = note ? [] : await tx.select().from(pushSubscriptions);
  if (note || !subs.length) {
    await tx.update(notifications).set({ pushNote: note ?? "No device subscribed to push." }).where(inArray(notifications.id, created.map((c) => c.id)));
    return { created: created.length, pushed: 0 };
  }
  let pushed = 0;
  for (const n of created) {
    const r = await deliver(tx, sender!, subs, { title: n.title, body: n.body, url: n.url, tag: n.dedupeKey });
    if (r.delivered) pushed += 1;
    await tx.update(notifications).set(r.delivered ? { pushedAt: new Date(), pushNote: null } : { pushNote: r.error ?? "No device accepted the push." }).where(eq(notifications.id, n.id));
  }
  return { created: created.length, pushed };
}

type SubscriptionRow = typeof pushSubscriptions.$inferSelect;

/**
 * Sends one payload to every live device. Devices the push service reports as
 * gone are deleted and dropped from `subs` (so later sends in the same run skip
 * them); other failures are counted on the device.
 */
async function deliver(tx: Tx, sender: PushSender, subs: SubscriptionRow[], payload: PushPayload) {
  let delivered = 0;
  let error: string | null = null;
  for (const s of [...subs]) {
    const r = await sender(s, payload);
    if (r.ok) {
      delivered += 1;
      await tx.update(pushSubscriptions).set({ lastSuccessAt: new Date(), failures: 0 }).where(eq(pushSubscriptions.id, s.id));
    } else if (r.gone) {
      await tx.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id));
      subs.splice(subs.indexOf(s), 1);
    } else {
      error ??= r.error;
      await tx.update(pushSubscriptions).set({ failures: sql`${pushSubscriptions.failures} + 1` }).where(eq(pushSubscriptions.id, s.id));
    }
  }
  return { delivered, error };
}

/** A notification on demand, to check push works on this device. */
export async function sendTest(tx: Tx, sender: PushSender | null) {
  const [n] = await tx
    .insert(notifications)
    .values({ kind: "milestones", dedupeKey: `test:${Date.now()}`, title: "Test notification", body: "Notifications from FiveYearOS reach this device.", url: "/settings/notifications" })
    .returning();
  const subs = sender ? await tx.select().from(pushSubscriptions) : [];
  const devices = subs.length;
  const { delivered, error } = sender && devices ? await deliver(tx, sender, subs, { title: n.title, body: n.body, url: n.url, tag: n.dedupeKey }) : { delivered: 0, error: null };
  await tx.update(notifications).set(delivered ? { pushedAt: new Date() } : { pushNote: !sender ? "Push isn't configured on the server." : devices ? (error ?? "No device accepted the push.") : "No device subscribed to push." }).where(eq(notifications.id, n.id));
  return { delivered, devices };
}
