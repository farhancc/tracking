import { describe, expect, it } from "vitest";
import { parseMinutes, weekOf, weeklyGoalPeriod, weeklyScorecard, type ScorecardTask } from "./weekly";

const task = (over: Partial<ScorecardTask> = {}): ScorecardTask => ({
  status: "todo",
  isDeliverable: false,
  estimatedMinutes: null,
  actualMinutes: null,
  carryCount: 0,
  area: "sales",
  ...over,
});

describe("weeks", () => {
  it("respects the week start day and clamps goals to the parent", () => {
    expect(weekOf("2027-01-07", 1)).toEqual({ weekStart: "2027-01-04", weekEnd: "2027-01-10" });
    expect(weekOf("2027-01-07", 0)).toEqual({ weekStart: "2027-01-03", weekEnd: "2027-01-09" });
    expect(weeklyGoalPeriod({ weekStart: "2027-01-25", weekEnd: "2027-01-31" }, { startDate: "2027-01-01", targetDate: "2027-01-28" })).toEqual({
      startDate: "2027-01-25",
      targetDate: "2027-01-28",
    });
    expect(weeklyGoalPeriod({ weekStart: "2027-02-01", weekEnd: "2027-02-07" }, { startDate: "2027-01-01", targetDate: "2027-01-31" })).toBeNull();
  });
});

describe("weekly scorecard", () => {
  const goals = [{ area: "sales" as const, completionPct: 50, status: "in_progress", isTargetMet: false }];

  it("scores outcomes and deliverables, not task volume", () => {
    const base = weeklyScorecard({
      goals,
      tasks: [task({ isDeliverable: true, status: "done" }), task({ isDeliverable: true })],
      capacityHours: null,
    });
    expect(base.score).toBe(50); // 0.6 × 50 + 0.4 × 50

    // Twenty extra completed routine tasks do not raise the score.
    const busy = weeklyScorecard({
      goals,
      tasks: [task({ isDeliverable: true, status: "done" }), task({ isDeliverable: true }), ...Array.from({ length: 20 }, () => task({ status: "done" }))],
      capacityHours: null,
    });
    expect(busy.score).toBe(50);
    expect(busy.insights.map((i) => i.message).join(" ")).toMatch(/completed 21 tasks but only 1 of 2 deliverables/);
  });

  it("flags chronic carry-overs, optimistic estimates and over-planning", () => {
    const s = weeklyScorecard({
      goals,
      tasks: [
        task({ status: "done", isDeliverable: true, estimatedMinutes: 60, actualMinutes: 90 }),
        task({ status: "done", isDeliverable: true, estimatedMinutes: 60, actualMinutes: 90 }),
        task({ carryCount: 2, estimatedMinutes: 600 }),
      ],
      capacityHours: 10,
    });
    expect(s.time.estimateRatio).toBe(1.5);
    expect(s.tasks).toMatchObject({ planned: 3, done: 2, unfinished: 1, chronic: 1 });
    const text = s.insights.map((i) => i.message).join(" ");
    expect(text).toMatch(/carried forward twice/);
    expect(text).toMatch(/50% longer than estimated/);
    expect(text).toMatch(/12 h of tasks planned against 10 h/);
  });

  it("ignores cancelled tasks and reports by area", () => {
    const s = weeklyScorecard({
      goals: [...goals, { area: "content", completionPct: 100, status: "achieved", isTargetMet: true }],
      tasks: [task({ isDeliverable: true, status: "cancelled" }), task({ isDeliverable: true, status: "done", area: "content" })],
      capacityHours: null,
    });
    expect(s.deliverables).toEqual({ planned: 1, delivered: 1, rate: 100 });
    expect(s.goals).toMatchObject({ total: 2, met: 1, averageCompletion: 75 });
    expect(s.byArea.map((a) => a.area)).toEqual(["content", "sales"]);
  });
});

describe("parseMinutes", () => {
  it("reads common duration formats", () => {
    expect(parseMinutes("90")).toBe(90);
    expect(parseMinutes("1.5h")).toBe(90);
    expect(parseMinutes("1h 30m")).toBe(90);
    expect(parseMinutes("45m")).toBe(45);
    expect(parseMinutes("")).toBeNull();
    expect(parseMinutes("soon")).toBeNaN();
  });
});
