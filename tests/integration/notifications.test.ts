import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { notifications, pushSubscriptions, tasks } from "../../src/db/schema";
import { taskCreateSchema } from "../../src/features/goals/schemas";
import { createTask } from "../../src/features/goals/server/service";
import { habitCreateSchema } from "../../src/features/habits/schemas";
import { createHabit } from "../../src/features/habits/server/service";
import { listInbox, markRead, runForUser, savePreferences, sendTest, subscribe, unreadCount, type PushSender } from "../../src/features/notifications/server/service";
import { todayIn } from "../../src/lib/domain/dates";
import { DEFAULT_PREFERENCES } from "../../src/lib/domain/notifications";
import { connect } from "./helpers";

const h = connect();
afterAll(() => h.close());
const today = todayIn("UTC");
const at = (hhmm: string) => new Date(`${today}T${hhmm}:00Z`);

function fakeSender(goneEndpoints: string[] = []) {
  const sent: { endpoint: string; title: string }[] = [];
  const attempts: string[] = [];
  const sender: PushSender = async (sub, payload) => {
    attempts.push(sub.endpoint);
    if (goneEndpoints.includes(sub.endpoint)) return { ok: false, gone: true, error: "410" };
    sent.push({ endpoint: sub.endpoint, title: payload.title });
    return { ok: true };
  };
  return { sender, sent, attempts };
}
const sub = (n: string) => ({ endpoint: `https://push.example.com/${n}`, keys: { p256dh: "p256dh-key-0123456789", auth: "auth-key-0123456789" } });

describe("notifications and reminders", () => {
  it("creates each due reminder once, pushes to live devices and drops dead ones", async () => {
    const o = await h.newOwner();
    await h.as(o.userId, (tx) => createTask(tx, taskCreateSchema.parse({ title: "Send proposal", dueOn: today })));
    await h.as(o.userId, (tx) => createHabit(tx, habitCreateSchema.parse({ name: "Read" })));
    await h.as(o.userId, (tx) => subscribe(tx, sub(`${o.userId}-phone`), "phone"));
    await h.as(o.userId, (tx) => subscribe(tx, sub(`${o.userId}-old`), "old laptop"));
    const { sender, sent, attempts } = fakeSender([`https://push.example.com/${o.userId}-old`]);

    const r = await h.as(o.userId, (tx) => runForUser(tx, at("20:30"), sender));
    const inbox = await h.as(o.userId, (tx) => listInbox(tx));
    expect(inbox.map((n) => n.kind).sort()).toEqual(["daily_planning", "habits", "task_deadlines"]);
    expect(r).toEqual({ created: 3, pushed: 3 });
    expect(sent.every((s) => s.endpoint.endsWith("-phone"))).toBe(true);
    // A gone device is removed on the first failure and not tried again for the other reminders.
    expect(attempts.filter((e) => e.endsWith("-old"))).toHaveLength(1);
    expect((await h.as(o.userId, (tx) => tx.select().from(pushSubscriptions))).map((s) => s.userAgent)).toEqual(["phone"]);
    expect(inbox.every((n) => n.pushedAt)).toBe(true);

    // Running again the same day creates nothing new.
    expect(await h.as(o.userId, (tx) => runForUser(tx, at("21:00"), sender))).toEqual({ created: 0, pushed: 0 });
    expect(await h.as(o.userId, (tx) => unreadCount(tx))).toBe(3);
    await h.as(o.userId, (tx) => markRead(tx, inbox[0].id));
    expect(await h.as(o.userId, (tx) => unreadCount(tx))).toBe(2);
    await h.as(o.userId, (tx) => markRead(tx, "all"));
    expect(await h.as(o.userId, (tx) => unreadCount(tx))).toBe(0);

    // Done tasks don't trigger a deadline reminder (checked on a fresh owner).
    const other = await h.newOwner();
    const t = await h.as(other.userId, (tx) => createTask(tx, taskCreateSchema.parse({ title: "x", dueOn: today })));
    await h.as(other.userId, (tx) => tx.update(tasks).set({ status: "done" }).where(eq(tasks.id, t.id)));
    await h.as(other.userId, (tx) => runForUser(tx, at("09:00"), null));
    expect((await h.as(other.userId, (tx) => listInbox(tx))).map((n) => n.kind)).toEqual(["daily_planning"]);
    // Without push configured the reminder still lands in the inbox, with a note.
    expect((await h.as(other.userId, (tx) => listInbox(tx)))[0].pushNote).toMatch(/isn't configured/);
    // Another user can't see this user's inbox.
    expect((await h.as(other.userId, (tx) => tx.select().from(notifications))).every((n) => n.userId === other.userId)).toBe(true);
  });

  it("respects quiet hours, push off and switched-off reminders; moves an endpoint to whoever subscribes", async () => {
    const o = await h.newOwner();
    await h.as(o.userId, (tx) => createTask(tx, taskCreateSchema.parse({ title: "x", dueOn: today })));
    await h.as(o.userId, (tx) => subscribe(tx, sub("shared-browser"), null));
    const { sender, sent } = fakeSender();
    await h.as(o.userId, (tx) => savePreferences(tx, { ...DEFAULT_PREFERENCES, quietStart: "08:00", quietEnd: "23:00", daily_planning: { enabled: false, time: "07:30" } }));
    const r = await h.as(o.userId, (tx) => runForUser(tx, at("09:00"), sender));
    expect(r).toEqual({ created: 1, pushed: 0 });
    expect(sent).toEqual([]);
    expect((await h.as(o.userId, (tx) => listInbox(tx)))[0]).toMatchObject({ kind: "task_deadlines", pushNote: "Quiet hours.", pushedAt: null });

    // The same browser subscribed by another user now belongs to them.
    const other = await h.newOwner();
    await h.as(other.userId, (tx) => subscribe(tx, sub("shared-browser"), null));
    expect(await h.as(o.userId, (tx) => tx.select().from(pushSubscriptions))).toEqual([]);
    expect((await h.as(other.userId, (tx) => tx.select().from(pushSubscriptions))).length).toBe(1);
    const test = await h.as(other.userId, (tx) => sendTest(tx, sender));
    expect(test).toEqual({ delivered: 1, devices: 1 });

    // A device that fails without being gone is kept and its failures counted.
    const flaky: PushSender = async () => ({ ok: false, gone: false, error: "Push service returned 503." });
    expect(await h.as(other.userId, (tx) => sendTest(tx, flaky))).toEqual({ delivered: 0, devices: 1 });
    const [device] = await h.as(other.userId, (tx) => tx.select().from(pushSubscriptions));
    expect(device.failures).toBe(1);
    expect((await h.as(other.userId, (tx) => listInbox(tx)))[0].pushNote).toBe("Push service returned 503.");
  });
});
