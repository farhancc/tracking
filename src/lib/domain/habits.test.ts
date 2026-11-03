import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import { consistency, dayState, missedAnalysis, priorityCorrelation, streaks, weeklyTrend, type CheckinStatus, type HabitContext, type HabitDef } from "./habits";

// 2026-11-02 is a Monday.
const today = "2026-11-04"; // Wednesday
const ctx = (checkins: Record<string, CheckinStatus | [CheckinStatus, string]>, rest: string[] = [], t = today): HabitContext => ({
  checkins: new Map(Object.entries(checkins).map(([d, v]) => [d, Array.isArray(v) ? { status: v[0], note: v[1] } : { status: v, note: null }])),
  restDays: new Set(rest),
  today: t,
  weekStartsOn: 1,
});
const weekdays: HabitDef = { id: "h1", name: "Study sales", scheduleKind: "days", scheduleDays: [1, 2, 3, 4, 5], weeklyTarget: null, startedOn: "2026-10-01" };
const weekly: HabitDef = { id: "h2", name: "Exercise", scheduleKind: "weekly", scheduleDays: [0, 1, 2, 3, 4, 5, 6], weeklyTarget: 3, startedOn: "2026-10-01" };

describe("habits", () => {
  it("never counts today against you and excuses rest days", () => {
    const c = ctx({ "2026-11-02": "done", "2026-10-30": "rest" }, ["2026-10-29"]);
    expect(dayState(weekdays, today, c)).toBe("pending");
    expect(dayState(weekdays, "2026-11-03", c)).toBe("missed");
    expect(dayState(weekdays, "2026-10-30", c)).toBe("rest");
    expect(dayState(weekdays, "2026-10-29", c)).toBe("rest");
    expect(dayState(weekdays, "2026-11-01", c)).toBe("off"); // Sunday
    expect(dayState(weekdays, "2026-09-30", c)).toBe("off"); // before it started
    // This week: Mon done, Tue missed, Wed pending.
    expect(consistency(weekdays, "2026-11-02", "2026-11-08", c)).toEqual({ done: 1, expected: 2, rate: 0.5 });
  });

  it("lets a different day make up for a scheduled one", () => {
    const c = ctx({ "2026-10-26": "done", "2026-10-27": "done", "2026-10-29": "done", "2026-10-30": "done", "2026-10-31": "done" });
    // Wed 28 missed, Saturday 31 done instead.
    expect(consistency(weekdays, "2026-10-26", "2026-11-01", c)).toEqual({ done: 5, expected: 5, rate: 1 });
  });

  it("measures weekly targets per week and leaves an unfinished week out", () => {
    const c = ctx({ "2026-10-20": "done", "2026-10-22": "done", "2026-10-24": "done", "2026-10-27": "done", "2026-11-02": "done" }, ["2026-10-29", "2026-10-30"]);
    // Week of 19 Oct: 3/3. Week of 26 Oct: target 3 − 2 rest days = 1, done 1. This week: 1/3 but unfinished → left out.
    expect(consistency(weekly, "2026-10-19", "2026-11-08", c)).toEqual({ done: 4, expected: 4, rate: 1 });
    expect(streaks(weekly, c)).toMatchObject({ current: 2, unit: "weeks" });
    const missedWeek = ctx({ "2026-10-20": "done" }, [], "2026-11-04");
    expect(missedAnalysis(weekly, "2026-10-19", missedWeek).missedWeeks).toContain("2026-10-19");
  });

  it("keeps streaks through rest and unscheduled days, and remembers the best", () => {
    const c = ctx({ "2026-10-26": "done", "2026-10-27": "done", "2026-10-28": "done", "2026-10-29": "done", "2026-10-30": "rest", "2026-11-02": "done", "2026-11-03": "done" });
    // Oct 1–23 mostly missed, then 26→Nov 3 done with a rest Friday and a weekend between; Wed 4th pending.
    expect(streaks(weekdays, c)).toEqual({ current: 6, best: 6, unit: "days" });
  });

  it("finds the hardest weekday and the reasons you gave", () => {
    const c = ctx({ "2026-10-26": ["skipped", "Client dinner"], "2026-10-27": "done", "2026-10-28": "done", "2026-10-29": "done", "2026-10-30": "done", "2026-11-02": ["skipped", "Travel"] });
    const m = missedAnalysis(weekdays, "2026-10-26", c);
    expect(m.hardestDay).toBe(1); // Monday
    expect(m.reasons.map((r) => r.note)).toEqual(["Travel", "Client dinner"]);
  });

  it("compares priority completion on habit days vs other days only with enough data", () => {
    const checkins: Record<string, CheckinStatus> = {};
    const scores = new Map<string, number>();
    let d = "2026-10-01";
    for (let i = 0; i < 25; i++, d = addDays(d, 1)) {
      const done = i % 2 === 0;
      if (done) checkins[d] = "done";
      scores.set(d, done ? 0.9 : 0.4);
    }
    const r = priorityCorrelation({ ...weekdays, scheduleDays: [0, 1, 2, 3, 4, 5, 6] }, "2026-10-01", ctx(checkins, [], "2026-10-26"), scores);
    expect(r.enough).toBe(true);
    expect(r.difference).toBeCloseTo(0.5);
    const few = priorityCorrelation(weekdays, "2026-10-01", ctx({ "2026-10-01": "done" }, [], "2026-10-05"), new Map([["2026-10-01", 1]]));
    expect(few).toMatchObject({ enough: false, difference: null });
  });

  it("builds a weekly trend across habits", () => {
    const c = ctx({ "2026-11-02": "done", "2026-11-03": "done" });
    const t = weeklyTrend([{ def: weekdays, ctx: c }], 2, today, 1);
    expect(t.map((w) => [w.weekStart, w.done, w.expected])).toEqual([
      ["2026-10-26", 0, 5],
      ["2026-11-02", 2, 2],
    ]);
  });
});
