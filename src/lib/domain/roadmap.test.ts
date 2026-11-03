import { describe, expect, it } from "vitest";
import { assessQuarterPlan, buildRoadmapPeriods, capacityHours, kpiAttainment, periodState, summarizeQuarter } from "./roadmap";

describe("roadmap periods", () => {
  it("builds 5 years and 20 quarters from any start date", () => {
    const { years, quarters } = buildRoadmapPeriods("2026-11-15");
    expect(years[0]).toEqual({ yearNumber: 1, startDate: "2026-11-15", endDate: "2027-11-14" });
    expect(years[4].endDate).toBe("2031-11-14");
    expect(quarters[0]).toMatchObject({ startDate: "2026-11-15", endDate: "2027-02-14", quarterOfYear: 1 });
    expect(quarters[3]).toMatchObject({ startDate: "2027-08-15", endDate: "2027-11-14", quarterOfYear: 4 });
    expect(quarters[19].endDate).toBe("2031-11-14");
    expect(periodState(quarters[0], "2026-12-01")).toBe("current");
    expect(capacityHours(10, { startDate: "2027-01-01", endDate: "2027-03-31" })).toBe(129);
  });
});

describe("KPI attainment", () => {
  it("handles up and down KPIs", () => {
    expect(kpiAttainment({ direction: "up", targetValue: 50, actualValue: 40 })).toBe(80);
    expect(kpiAttainment({ direction: "up", targetValue: 50, actualValue: 80 })).toBe(100);
    expect(kpiAttainment({ direction: "down", targetValue: 5, actualValue: 4 })).toBe(100);
    expect(kpiAttainment({ direction: "down", targetValue: 5, actualValue: 10 })).toBe(50);
    expect(kpiAttainment({ direction: "up", targetValue: 5, actualValue: null })).toBeNull();
  });
});

describe("plan assessment", () => {
  const period = { startDate: "2027-01-01", endDate: "2027-03-31" };
  const objective = (id: string, hours: number | null = null, krs = 1) => ({ id, title: `O${id}`, estimatedHours: hours, keyResultCount: krs });

  it("flags too many objectives, missing key results and over-capacity plans", () => {
    const a = assessQuarterPlan({
      period,
      hoursPerWeek: 5,
      objectives: [objective("1", 30), objective("2", 30), objective("3", 30, 0), objective("4", 10), objective("5", 10), objective("6", 10)],
      deliverables: [],
      history: null,
    });
    expect(a.capacityHours).toBe(65);
    expect(a.plannedHours).toBe(120);
    expect(a.warnings.map((w) => w.code)).toEqual(["too_many_objectives", "objectives_without_key_results", "over_capacity"]);
  });

  it("takes the larger of an objective's estimate and its deliverables' estimates", () => {
    const a = assessQuarterPlan({
      period,
      hoursPerWeek: 10,
      objectives: [objective("1", 100), objective("2", 20), objective("3", 5)],
      deliverables: [
        { goalId: "1", estimatedHours: 30, status: "planned" },
        { goalId: "2", estimatedHours: 25, status: "planned" },
        { goalId: null, estimatedHours: 4, status: "planned" },
        { goalId: null, estimatedHours: 10, status: "dropped" },
      ],
      history: null,
    });
    expect(a.plannedHours).toBe(134); // 100 + 25 + 5 + 4
    expect(a.warnings.map((w) => w.code)).toEqual(["over_capacity"]); // 134 h > 129 h available
  });

  it("compares the plan with the track record", () => {
    const a = assessQuarterPlan({
      period,
      hoursPerWeek: 10,
      objectives: [objective("1"), objective("2"), objective("3"), objective("4")],
      deliverables: Array.from({ length: 6 }, () => ({ goalId: null, estimatedHours: 5, status: "planned" as const })),
      history: { quarters: 2, deliverablesPlanned: 10, deliverablesDelivered: 6, objectiveCompletion: 40 },
    });
    expect(a.deliveryRate).toBe(60);
    expect(a.warnings.map((w) => w.code)).toEqual(expect.arrayContaining(["above_track_record", "low_past_completion"]));
  });

  it("summarizes planned against actual", () => {
    const s = summarizeQuarter({
      objectives: [{ completionPct: 50, status: "in_progress" }, { completionPct: 100, status: "achieved" }],
      deliverables: [{ status: "delivered" }, { status: "planned" }, { status: "dropped" }],
      kpis: [{ direction: "up", targetValue: 10, actualValue: 5 }],
      risks: [{ status: "open" }, { status: "closed" }],
      dependencies: [{ status: "resolved" }],
    });
    expect(s).toEqual({
      objectives: 2,
      objectivesAchieved: 1,
      objectiveCompletion: 75,
      deliverablesPlanned: 2,
      deliverablesDelivered: 1,
      kpiAttainment: 50,
      openRisks: 1,
      openDependencies: 0,
    });
  });
});
