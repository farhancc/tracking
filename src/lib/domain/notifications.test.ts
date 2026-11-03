import { describe, expect, it } from "vitest";
import { DEFAULT_PREFERENCES, dueNotifications, inQuietHours, lastDayOfMonth, localNow, type DueInput } from "./notifications";

const base: DueInput = {
  now: { date: "2026-11-06", time: "06:00", weekday: 5 },
  prefs: DEFAULT_PREFERENCES,
  mitsSetToday: 0,
  tasksDueToday: 0,
  tasksOverdue: 0,
  weekReviewed: false,
  habitsOpenToday: 0,
  achievedGoals: [],
  behindGoalsDueSoon: [],
};

describe("notifications", () => {
  it("converts to the user's local time", () => {
    expect(localNow("Asia/Kolkata", new Date("2026-11-03T20:00:00Z"))).toEqual({ date: "2026-11-04", time: "01:30", weekday: 3 });
    expect(localNow("America/Los_Angeles", new Date("2026-11-03T20:00:00Z"))).toEqual({ date: "2026-11-03", time: "12:00", weekday: 2 });
  });

  it("handles quiet hours across midnight", () => {
    expect(inQuietHours("23:30", "22:00", "07:00")).toBe(true);
    expect(inQuietHours("06:59", "22:00", "07:00")).toBe(true);
    expect(inQuietHours("07:00", "22:00", "07:00")).toBe(false);
    expect(inQuietHours("13:00", "12:00", "14:00")).toBe(true);
    expect(inQuietHours("13:00", null, null)).toBe(false);
  });

  it("fires each reminder from its time, only when it's still relevant", () => {
    expect(dueNotifications(base)).toEqual([]);
    const morning = dueNotifications({ ...base, now: { ...base.now, time: "08:15" }, mitsSetToday: 1, tasksDueToday: 2, tasksOverdue: 1 });
    expect(morning.map((n) => [n.kind, n.dedupeKey, n.title])).toEqual([
      ["daily_planning", "daily_planning:2026-11-06", "Plan today"],
      ["task_deadlines", "task_deadlines:2026-11-06", "2 task(s) due today"],
    ]);
    expect(dueNotifications({ ...base, now: { ...base.now, time: "08:15" }, mitsSetToday: 3 })).toEqual([]);
    // Friday 17:00 is the default review time; a reviewed week gets no reminder.
    const friday = { ...base, now: { ...base.now, time: "17:05" } };
    expect(dueNotifications(friday).map((n) => n.kind)).toEqual(["daily_planning", "weekly_review"]);
    expect(dueNotifications({ ...friday, weekReviewed: true, mitsSetToday: 3 })).toEqual([]);
    const evening = dueNotifications({ ...base, now: { date: "2026-11-30", time: "20:30", weekday: 1 }, mitsSetToday: 3, habitsOpenToday: 2 });
    expect(evening.map((n) => [n.kind, n.dedupeKey])).toEqual([
      ["monthly_review", "monthly_review:2026-11"],
      ["habits", "habits:2026-11-30"],
    ]);
    expect(lastDayOfMonth("2028-02-10")).toBe("2028-02-29");
  });

  it("reports milestones once per goal and respects switched-off kinds", () => {
    const n = dueNotifications({
      ...base,
      mitsSetToday: 3,
      achievedGoals: [{ id: "g1", title: "Close 3 deals" }],
      behindGoalsDueSoon: [{ id: "g2", title: "Launch beta", targetDate: "2026-11-10", progressPct: 40 }],
    });
    expect(n.map((x) => x.dedupeKey)).toEqual(["goal_achieved:g1", "goal_due_soon:g2:2026-11-10"]);
    const off = { ...DEFAULT_PREFERENCES, milestones: { enabled: false }, daily_planning: { enabled: false, time: "07:30" } };
    expect(dueNotifications({ ...base, prefs: off, now: { ...base.now, time: "09:00" }, achievedGoals: [{ id: "g1", title: "x" }] })).toEqual([]);
  });
});
