import { describe, expect, it } from "vitest";
import { addMonths, isIsoDate, startOfWeek, todayIn } from "./dates";
import {
  buildTree,
  canMarkAchieved,
  childLevelsFor,
  completionPercent,
  expectedPercent,
  goalHealth,
  isTargetMet,
  isValidParentLevel,
  suggestPeriod,
  summarizeChildren,
  summarizeTasks,
} from "./goals";

describe("dates", () => {
  it("validates and does calendar arithmetic", () => {
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isIsoDate("2027-02-29")).toBe(false);
    expect(addMonths("2027-01-31", 1)).toBe("2027-02-28");
    expect(startOfWeek("2027-01-07", 1)).toBe("2027-01-04"); // Thursday → Monday
    expect(startOfWeek("2027-01-07", 0)).toBe("2027-01-03"); // → Sunday
    expect(todayIn("Asia/Kolkata", new Date("2027-01-01T20:00:00Z"))).toBe("2027-01-02");
  });
});

describe("hierarchy", () => {
  it("only allows parents above the child", () => {
    expect(isValidParentLevel("five_year", "annual")).toBe(true);
    expect(isValidParentLevel("annual", "daily")).toBe(true); // levels may be skipped
    expect(isValidParentLevel("monthly", "quarterly")).toBe(false);
    expect(isValidParentLevel("weekly", "weekly")).toBe(false);
    expect(childLevelsFor("monthly")).toEqual(["weekly", "daily"]);
    expect(childLevelsFor("daily")).toEqual([]);
  });

  it("builds a forest and promotes orphans to roots", () => {
    const tree = buildTree([
      { id: "a", parentId: null },
      { id: "b", parentId: "a" },
      { id: "c", parentId: "missing" },
    ]);
    expect(tree.map((n) => n.id)).toEqual(["a", "c"]);
    expect(tree[0].children.map((n) => n.id)).toEqual(["b"]);
  });
});

describe("outcome progress", () => {
  it("measures increase and decrease goals from the baseline", () => {
    expect(completionPercent({ baselineValue: 0, targetValue: 200, currentValue: 50 })).toBe(25);
    expect(completionPercent({ baselineValue: 100, targetValue: 1000, currentValue: 500 })).toBe(44.4);
    expect(completionPercent({ baselineValue: 50_000, targetValue: 0, currentValue: 20_000 })).toBe(60);
    expect(completionPercent({ baselineValue: 0, targetValue: 10, currentValue: 25 })).toBe(100); // clamped
    expect(completionPercent({ baselineValue: 0, targetValue: 10, currentValue: -5 })).toBe(0);
    expect(isTargetMet({ baselineValue: 50_000, targetValue: 0, currentValue: 0 })).toBe(true);
  });

  it("compares outcome progress with elapsed time", () => {
    const goal = {
      baselineValue: 0,
      targetValue: 100,
      currentValue: 50,
      status: "in_progress" as const,
      startDate: "2027-01-01",
      targetDate: "2027-12-31",
    };
    expect(expectedPercent(goal, "2027-07-02")).toBe(50.1);
    expect(goalHealth(goal, "2027-07-02")).toBe("on_track");
    expect(goalHealth({ ...goal, currentValue: 35 }, "2027-07-02")).toBe("at_risk");
    expect(goalHealth({ ...goal, currentValue: 10 }, "2027-07-02")).toBe("off_track");
    expect(goalHealth({ ...goal, currentValue: 0 }, "2027-01-10")).toBe("on_track"); // too early to judge
    expect(goalHealth({ ...goal, currentValue: 100 }, "2027-07-02")).toBe("target_met");
    expect(goalHealth(goal, "2028-01-05")).toBe("overdue");
    expect(goalHealth({ ...goal, status: "achieved" }, "2028-01-05")).toBe("achieved");
  });
});

describe("achievement rules", () => {
  const notMet = { baselineValue: 0, targetValue: 10, currentValue: 3 };
  const met = { baselineValue: 0, targetValue: 10, currentValue: 10 };

  it("requires the outcome, not activity", () => {
    const result = canMarkAchieved(notMet, []);
    expect(result.allowed).toBe(false);
    expect(summarizeTasks([{ status: "done" }, { status: "done" }])).toEqual({ total: 2, done: 2 });
    expect(summarizeChildren([{ status: "achieved" }])).toMatchObject({ achieved: 1 });
    // Neither summary is an input to canMarkAchieved: the rule only sees the outcome.
    expect(canMarkAchieved(met, []).allowed).toBe(true);
  });

  it("requires blocking prerequisites to be achieved", () => {
    const prereqs = [
      { goalId: "1", title: "Incorporate company", status: "in_progress" as const, isBlocking: true },
      { goalId: "2", title: "Grow audience", status: "in_progress" as const, isBlocking: false },
    ];
    const result = canMarkAchieved(met, prereqs);
    expect(result).toEqual({ allowed: false, reasons: [expect.stringContaining("Incorporate company")] });
    expect(canMarkAchieved(met, [{ ...prereqs[0], status: "achieved" }, prereqs[1]]).allowed).toBe(true);
  });
});

describe("period suggestions", () => {
  const journey = { startDate: "2027-01-01", targetDate: "2031-12-31" };
  it("suggests periods per level, clamped to the parent", () => {
    expect(suggestPeriod("five_year", "2027-01-01", journey)).toEqual(journey);
    expect(suggestPeriod("annual", "2027-01-01", journey)).toEqual({ startDate: "2027-01-01", targetDate: "2027-12-31" });
    expect(suggestPeriod("quarterly", "2027-04-01", journey)).toEqual({ startDate: "2027-04-01", targetDate: "2027-06-30" });
    expect(suggestPeriod("weekly", "2027-01-07", journey, 1)).toEqual({ startDate: "2027-01-04", targetDate: "2027-01-10" });
    expect(suggestPeriod("daily", "2027-03-05", journey)).toEqual({ startDate: "2027-03-05", targetDate: "2027-03-05" });
    const parent = { startDate: "2027-01-01", targetDate: "2027-03-31" };
    expect(suggestPeriod("monthly", "2027-03-15", parent)).toEqual({ startDate: "2027-03-15", targetDate: "2027-03-31" });
    expect(suggestPeriod("weekly", "2027-01-01", parent, 1)).toEqual({ startDate: "2027-01-01", targetDate: "2027-01-03" });
  });
});
