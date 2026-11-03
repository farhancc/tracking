import { afterAll, describe, expect, it } from "vitest";
import { goalCreateSchema, measurementCreateSchema } from "../../src/features/goals/schemas";
import { addMeasurement, createGoal, getGoal, updateGoal } from "../../src/features/goals/server/service";
import { deliverableCreateSchema, kpiCreateSchema, riskCreateSchema } from "../../src/features/roadmap/schemas";
import {
  addDeliverable,
  addKpi,
  addQuarterDependency,
  addRisk,
  generateRoadmap,
  getQuarter,
  getRoadmap,
  updateDeliverable,
  updateQuarter,
  updateRoadmapSettings,
  updateYear,
} from "../../src/features/roadmap/server/service";
import { connect, rejectsWith } from "./helpers";

const h = connect();
afterAll(() => h.close());

type Owner = Awaited<ReturnType<typeof h.newOwner>>;

async function ownerWithRoadmap() {
  const o = await h.newOwner(); // journey 2027-01-01 → 2031-12-31
  const roadmap = await h.as(o.userId, (tx) => generateRoadmap(tx));
  return { ...o, roadmap };
}

function quarterlyObjective(o: Owner, parentId: string, over: Record<string, unknown> = {}) {
  return goalCreateSchema.parse({
    title: "Validate a SaaS idea",
    pillarId: o.pillar("product"),
    level: "quarterly",
    parentId,
    startDate: "2027-01-01",
    targetDate: "2027-03-31",
    successMetric: "Key results",
    measurementMode: "key_results",
    targetValue: 100,
    ...over,
  });
}

function keyResult(o: Owner, parentId: string, over: Record<string, unknown> = {}) {
  return goalCreateSchema.parse({
    title: "KR",
    pillarId: o.pillar("product"),
    level: "quarterly",
    parentId,
    isKeyResult: true,
    startDate: "2027-01-01",
    targetDate: "2027-03-31",
    successMetric: "Customer interviews",
    unit: "count",
    measurementMode: "cumulative",
    targetValue: 20,
    ...over,
  });
}

async function annualUnderFiveYear(o: Owner) {
  const five = await h.as(o.userId, (tx) =>
    createGoal(
      tx,
      goalCreateSchema.parse({
        title: "Own a profitable SaaS",
        pillarId: o.pillar("product"),
        level: "five_year",
        category: "business_ownership",
        startDate: "2027-01-01",
        targetDate: "2031-12-31",
        successMetric: "Paying customers",
        unit: "count",
        targetValue: 200,
      }),
    ),
  );
  return h.as(o.userId, (tx) =>
    createGoal(
      tx,
      goalCreateSchema.parse({
        title: "Validate and sell a first product",
        pillarId: o.pillar("product"),
        level: "annual",
        parentId: five.id,
        startDate: "2027-01-01",
        targetDate: "2027-12-31",
        successMetric: "Paying customers",
        unit: "count",
        targetValue: 10,
      }),
    ),
  );
}

describe("roadmap generation", () => {
  it("splits the journey into 5 annual plans and 20 contiguous quarters with provisional directions", async () => {
    const o = await ownerWithRoadmap();
    if (!o.roadmap.generated) throw new Error("not generated");
    expect(o.roadmap.years.map((y) => [y.yearNumber, y.startDate, y.endDate, y.isProvisional])).toEqual([
      [1, "2027-01-01", "2027-12-31", true],
      [2, "2028-01-01", "2028-12-31", true],
      [3, "2029-01-01", "2029-12-31", true],
      [4, "2030-01-01", "2030-12-31", true],
      [5, "2031-01-01", "2031-12-31", true],
    ]);
    expect(o.roadmap.years[0].direction).toMatch(/Build sales competence/);
    expect(o.roadmap.years[4].direction).toMatch(/evaluate employment independence/);
    const quarters = o.roadmap.years.flatMap((y) => y.quarters);
    expect(quarters).toHaveLength(20);
    expect(quarters[0]).toMatchObject({ quarterNumber: 1, startDate: "2027-01-01", endDate: "2027-03-31", reviewOn: "2027-03-31", label: "Y1 Q1" });
    expect(quarters[19]).toMatchObject({ quarterNumber: 20, startDate: "2031-10-01", endDate: "2031-12-31", label: "Y5 Q4" });
    for (let i = 1; i < 20; i++) expect(quarters[i].startDate > quarters[i - 1].endDate).toBe(true);
    // No numeric targets are invented: no goals, deliverables or KPIs are created.
    expect(quarters.every((q) => q.actual.objectives === 0 && q.actual.deliverablesPlanned === 0)).toBe(true);
  });

  it("is idempotent and keeps edits", async () => {
    const o = await ownerWithRoadmap();
    await h.as(o.userId, (tx) => updateYear(tx, 2, { theme: "Revenue", direction: "Reach 50 paying customers.", isProvisional: false }));
    const again = await h.as(o.userId, (tx) => generateRoadmap(tx));
    if (!again.generated) throw new Error("not generated");
    expect(again.years).toHaveLength(5);
    expect(again.years[1]).toMatchObject({ theme: "Revenue", direction: "Reach 50 paying customers.", isProvisional: false });
  });

  it("applies weekly capacity to current and future quarters", async () => {
    const o = await ownerWithRoadmap();
    await h.as(o.userId, (tx) => updateRoadmapSettings(tx, { weeklyCapacityHours: 12, applyToFutureQuarters: true }));
    const q = await h.as(o.userId, (tx) => getQuarter(tx, 1));
    expect(q.quarter.capacityHoursPerWeek).toBe(12);
    expect(q.assessment.capacityHours).toBe(155); // 12 h × 12.9 weeks
  });
});

describe("objectives and key results", () => {
  it("measures an objective only from its key results' outcomes", async () => {
    const o = await ownerWithRoadmap();
    const annual = await annualUnderFiveYear(o);
    const objective = await h.as(o.userId, (tx) => createGoal(tx, quarterlyObjective(o, annual.id)));
    expect(objective).toMatchObject({ unit: "percent", baselineValue: 0, targetValue: 100, completionPct: 0 });

    const kr1 = await h.as(o.userId, (tx) => createGoal(tx, keyResult(o, objective.id, { title: "20 interviews" })));
    const kr2 = await h.as(o.userId, (tx) =>
      createGoal(tx, keyResult(o, objective.id, { title: "3 pre-sales", successMetric: "Pre-sales", targetValue: 3 })),
    );
    await h.as(o.userId, (tx) => addMeasurement(tx, kr1.id, measurementCreateSchema.parse({ measuredOn: "2026-10-01", value: 10 })));
    expect((await h.as(o.userId, (tx) => getGoal(tx, objective.id))).completionPct).toBe(25); // (50 + 0) / 2

    await h.as(o.userId, (tx) => addMeasurement(tx, kr2.id, measurementCreateSchema.parse({ measuredOn: "2026-10-01", value: 3 })));
    expect((await h.as(o.userId, (tx) => getGoal(tx, objective.id))).completionPct).toBe(75);

    // The objective itself cannot take direct measurements.
    await rejectsWith(h.as(o.userId, (tx) => addMeasurement(tx, objective.id, measurementCreateSchema.parse({ measuredOn: "2026-10-01", value: 100 }))), {
      detail: "measured_by_key_results",
    });
    // And it cannot be achieved until every key result is met.
    await rejectsWith(h.as(o.userId, (tx) => updateGoal(tx, objective.id, { status: "achieved" })), { detail: "achievement_requires_outcome" });
    await h.as(o.userId, (tx) => addMeasurement(tx, kr1.id, measurementCreateSchema.parse({ measuredOn: "2026-10-02", value: 10 })));
    expect((await h.as(o.userId, (tx) => updateGoal(tx, objective.id, { status: "achieved" }))).status).toBe("achieved");
  });

  it("keeps key results attached to an objective and out of the objective list", async () => {
    const o = await ownerWithRoadmap();
    const annual = await annualUnderFiveYear(o);
    const objective = await h.as(o.userId, (tx) => createGoal(tx, quarterlyObjective(o, annual.id)));
    const kr = await h.as(o.userId, (tx) => createGoal(tx, keyResult(o, objective.id)));
    await rejectsWith(h.as(o.userId, (tx) => createGoal(tx, keyResult(o, kr.id))), { detail: "key_result_under_key_result" });
    expect(() => keyResult(o, objective.id, { parentId: null })).toThrow(/needs the objective/);

    const detail = await h.as(o.userId, (tx) => getQuarter(tx, 1));
    expect(detail.objectives.map((x) => x.title)).toEqual(["Validate a SaaS idea"]);
    expect(detail.objectives[0].keyResults.map((x) => x.title)).toEqual(["KR"]);
    expect(detail.annualObjectives.map((a) => a.title)).toEqual(["Validate and sell a first product"]);
  });
});

describe("quarter planning artefacts", () => {
  it("tracks deliverables, KPIs, risks and dependencies, and compares planned with actual", async () => {
    const o = await ownerWithRoadmap();
    const annual = await annualUnderFiveYear(o);
    const objective = await h.as(o.userId, (tx) => createGoal(tx, quarterlyObjective(o, annual.id, { estimatedHours: 40 })));
    await h.as(o.userId, (tx) => createGoal(tx, keyResult(o, objective.id)));

    const landing = await h.as(o.userId, (tx) =>
      addDeliverable(tx, 1, deliverableCreateSchema.parse({ title: "Landing page live", goalId: objective.id, estimatedHours: 12 })),
    );
    await h.as(o.userId, (tx) => addDeliverable(tx, 1, deliverableCreateSchema.parse({ title: "Interview script", estimatedHours: 3 })));
    await h.as(o.userId, (tx) => addDeliverable(tx, 1, deliverableCreateSchema.parse({ title: "Dropped idea", status: "dropped" })));
    const delivered = await h.as(o.userId, (tx) => updateDeliverable(tx, landing.id, { status: "delivered", evidence: "https://example.com" }));
    expect(delivered.deliveredOn).not.toBeNull();
    const reopened = await h.as(o.userId, (tx) => updateDeliverable(tx, landing.id, { status: "in_progress" }));
    expect(reopened.deliveredOn).toBeNull();
    await h.as(o.userId, (tx) => updateDeliverable(tx, landing.id, { status: "delivered" }));

    await h.as(o.userId, (tx) => addKpi(tx, 1, kpiCreateSchema.parse({ name: "Interviews per week", targetValue: 5, actualValue: 4 })));
    await h.as(o.userId, (tx) => addKpi(tx, 1, kpiCreateSchema.parse({ name: "Churn", unit: "percent", direction: "down", targetValue: 5, actualValue: 10 })));
    await h.as(o.userId, (tx) => addRisk(tx, 1, riskCreateSchema.parse({ title: "Day job overtime", likelihood: 4, impact: 4, mitigation: "Block 6–8am" })));
    await h.as(o.userId, (tx) =>
      addQuarterDependency(tx, 1, { description: "Stripe account approval", dependsOnGoalId: null, neededBy: "2027-02-15", status: "open", notes: null }),
    );

    const q = await h.as(o.userId, (tx) => getQuarter(tx, 1));
    expect(q.actual).toMatchObject({
      objectives: 1,
      deliverablesPlanned: 2, // dropped excluded
      deliverablesDelivered: 1,
      kpiAttainment: 65, // (80 + 50) / 2
      openRisks: 1,
      openDependencies: 1,
    });
    expect(q.risks[0].score).toBe(16);
    expect(q.deliverables[0].goalTitle).toBe("Validate a SaaS idea");
    // max(objective 40 h, its deliverables 12 h) + 3 h unlinked; never double counted.
    expect(q.assessment.plannedHours).toBe(43);

    const roadmap = await h.as(o.userId, (tx) => getRoadmap(tx));
    if (!roadmap.generated) throw new Error("not generated");
    expect(roadmap.plannedVsActual[0]).toMatchObject({ planned: 2, delivered: 1 });
  });

  it("warns when a plan exceeds available time or the track record", async () => {
    const o = await ownerWithRoadmap();
    await h.as(o.userId, (tx) => updateQuarter(tx, 1, { capacityHoursPerWeek: 2 }));
    await h.as(o.userId, (tx) => addDeliverable(tx, 1, deliverableCreateSchema.parse({ title: "Build MVP", estimatedHours: 120 })));
    const q1 = await h.as(o.userId, (tx) => getQuarter(tx, 1));
    expect(q1.assessment.warnings.map((w) => w.code)).toEqual(expect.arrayContaining(["no_objectives", "over_capacity"]));

    // Q1 reviewed with 1 of 1 deliverables missed; Q2 plans 4 → above track record.
    await h.as(o.userId, (tx) => updateQuarter(tx, 1, { reviewed: true, reviewSummary: "Overcommitted." }));
    for (const title of ["A", "B", "C", "D"]) {
      await h.as(o.userId, (tx) => addDeliverable(tx, 2, deliverableCreateSchema.parse({ title })));
    }
    const q2 = await h.as(o.userId, (tx) => getQuarter(tx, 2));
    expect(q2.history).toMatchObject({ quarters: 1, deliverablesPlanned: 1, deliverablesDelivered: 0 });
    expect(q2.assessment.warnings.map((w) => w.code)).toContain("above_track_record");
  });

  it("rejects review dates outside the quarter", async () => {
    const o = await ownerWithRoadmap();
    await rejectsWith(h.as(o.userId, (tx) => updateQuarter(tx, 1, { midReviewOn: "2027-06-01" })), { code: "23514" });
  });
});
