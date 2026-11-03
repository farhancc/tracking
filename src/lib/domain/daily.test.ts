import { describe, expect, it } from "vitest";
import { dailyProgress, isScheduledOn, journeyDay } from "./daily";

describe("journey day", () => {
  it("counts days and journey years", () => {
    const j = { startDate: "2027-01-01", endDate: "2031-12-31" };
    expect(journeyDay(j, "2027-01-01")).toMatchObject({ day: 1, total: 1826, year: 1, started: true });
    expect(journeyDay(j, "2028-01-01")).toMatchObject({ day: 366, year: 2 });
    expect(journeyDay(j, "2026-12-31")).toMatchObject({ day: 0, started: false });
  });
});

describe("daily progress", () => {
  it("weights MITs 50%, other work 30% by minutes, habits 20%", () => {
    const p = dailyProgress({
      tasks: [
        { status: "done", estimatedMinutes: 60, mitRank: 1 },
        { status: "todo", estimatedMinutes: 60, mitRank: 2 },
        { status: "done", estimatedMinutes: 90, mitRank: null },
        { status: "todo", estimatedMinutes: 30, mitRank: null },
        { status: "cancelled", estimatedMinutes: 600, mitRank: null },
      ],
      habits: [{ status: "done" }, { status: null }, { status: "rest" }],
    });
    // 0.5×0.5 + 0.3×0.75 + 0.2×0.5 = 0.575
    expect(p.pct).toBe(58);
    expect(p.work).toEqual({ plannedMinutes: 120, doneMinutes: 90 });
    expect(p.habits).toEqual({ scheduled: 3, done: 1, rest: 1 });
    // A skipped habit (not done, not excused) counts against the habit share.
    expect(dailyProgress({ tasks: [], habits: [{ status: "done" }, { status: "skipped" }] }).pct).toBe(50);
  });

  it("does not let many small tasks outweigh one big one", () => {
    const p = dailyProgress({
      tasks: [
        ...Array.from({ length: 10 }, () => ({ status: "done" as const, estimatedMinutes: 5, mitRank: null })),
        { status: "todo", estimatedMinutes: 240, mitRank: null },
      ],
      habits: [],
    });
    expect(p.pct).toBe(17); // 50 of 290 minutes
  });

  it("is null with nothing planned", () => {
    expect(dailyProgress({ tasks: [], habits: [] }).pct).toBeNull();
  });

  it("matches habit schedules to weekdays", () => {
    expect(isScheduledOn([1, 3, 5], "2027-01-04")).toBe(true); // Monday
    expect(isScheduledOn([1, 3, 5], "2027-01-05")).toBe(false);
  });
});
