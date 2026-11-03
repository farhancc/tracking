import { afterAll, describe, expect, it } from "vitest";
import { goalCreateSchema, measurementCreateSchema, taskCreateSchema } from "../../src/features/goals/schemas";
import { addMeasurement, createGoal, createTask, updateTask } from "../../src/features/goals/server/service";
import { weeklyGoalCreateSchema } from "../../src/features/weekly/schemas";
import {
  carryForward,
  carryForwardAll,
  createWeeklyGoal,
  getWeek,
  rescheduleTask,
  reviewWeek,
  saveWeekPlan,
} from "../../src/features/weekly/server/service";
import { connect, rejectsWith } from "./helpers";

const h = connect();
afterAll(() => h.close());
type Owner = Awaited<ReturnType<typeof h.newOwner>>;

// Journey starts 2027-01-01 (a Friday); weeks start on Monday.
const W1 = "2027-01-04";
const W2 = "2027-01-11";

async function monthly(o: Owner) {
  const five = await h.as(o.userId, (tx) =>
    createGoal(tx, goalCreateSchema.parse({ title: "Top closer", pillarId: o.pillar("sales"), level: "five_year", category: "professional_identity", startDate: "2027-01-01", targetDate: "2031-12-31", successMetric: "Revenue", targetValue: 100 })),
  );
  return h.as(o.userId, (tx) =>
    createGoal(tx, goalCreateSchema.parse({ title: "Book 12 meetings in January", pillarId: o.pillar("sales"), level: "monthly", parentId: five.id, startDate: "2027-01-01", targetDate: "2027-01-31", successMetric: "Meetings", unit: "count", measurementMode: "cumulative", targetValue: 12 })),
  ).then((m) => ({ five, month: m }));
}

const weekly = (parentId: string, over: Record<string, unknown> = {}) =>
  weeklyGoalCreateSchema.parse({ focusArea: "sales", parentId, title: "Book 3 meetings", successMetric: "Meetings", targetValue: 3, ...over });

describe("weekly goals", () => {
  it("must be linked to a monthly, quarterly or annual objective", async () => {
    const o = await h.newOwner();
    const { five, month } = await monthly(o);
    await expect(h.as(o.userId, (tx) => createWeeklyGoal(tx, W1, weekly(five.id)))).rejects.toMatchObject({ code: "weekly_goal_needs_objective" });
    // The database enforces it too.
    await rejectsWith(
      h.as(o.userId, (tx) =>
        createGoal(tx, { ...goalCreateSchema.parse({ title: "x", pillarId: o.pillar("sales"), level: "weekly", parentId: five.id, focusArea: "sales", startDate: W1, targetDate: "2027-01-10", successMetric: "x", targetValue: 1 }) }),
      ),
      { detail: "weekly_goal_needs_objective" },
    );
    expect(() => goalCreateSchema.parse({ title: "x", pillarId: o.pillar("sales"), level: "weekly", startDate: W1, targetDate: "2027-01-10", successMetric: "x", targetValue: 1 })).toThrow(/focus area|monthly, quarterly or annual/);

    const g = await h.as(o.userId, (tx) => createWeeklyGoal(tx, W1, weekly(month.id)));
    expect(g).toMatchObject({ level: "weekly", focusArea: "sales", startDate: W1, targetDate: "2027-01-10", parentId: month.id });
  });

  it("is clamped to its objective's period", async () => {
    const o = await h.newOwner();
    const { month } = await monthly(o); // ends 2027-01-31 (a Sunday); week of 2027-01-25 fits
    const g = await h.as(o.userId, (tx) => createWeeklyGoal(tx, "2027-01-25", weekly(month.id)));
    expect([g.startDate, g.targetDate]).toEqual(["2027-01-25", "2027-01-31"]);
    await expect(h.as(o.userId, (tx) => createWeeklyGoal(tx, "2027-02-01", weekly(month.id)))).rejects.toMatchObject({ code: "outside_parent_period" });
    await expect(h.as(o.userId, (tx) => getWeek(tx, "2027-01-05"))).rejects.toMatchObject({ code: "not_a_week_start" });
  });
});

describe("tasks and scorecard", () => {
  it("measures the week by outcomes and deliverables, not task count", async () => {
    const o = await h.newOwner();
    const { month } = await monthly(o);
    const g = await h.as(o.userId, (tx) => createWeeklyGoal(tx, W1, weekly(month.id)));
    const deliverable = await h.as(o.userId, (tx) =>
      createTask(tx, taskCreateSchema.parse({ title: "Send 3 proposals", goalId: g.id, dueOn: "2027-01-07", isDeliverable: true, estimatedMinutes: 120 })),
    );
    expect(deliverable.plannedWeek).toBe(W1); // derived from the due date
    for (let i = 0; i < 6; i++) {
      const t = await h.as(o.userId, (tx) => createTask(tx, taskCreateSchema.parse({ title: `Admin ${i}`, goalId: g.id, plannedWeek: "2027-01-06" })));
      expect(t.plannedWeek).toBe(W1); // normalised to the week start
      await h.as(o.userId, (tx) => updateTask(tx, t.id, { status: "done" }));
    }
    let week = await h.as(o.userId, (tx) => getWeek(tx, W1));
    expect(week.scorecard.score).toBe(0); // 6 tasks done, but no outcome and no deliverable
    expect(week.scorecard.tasks).toMatchObject({ planned: 7, done: 6 });

    await h.as(o.userId, (tx) => updateTask(tx, deliverable.id, { status: "done", actualMinutes: 150 }));
    await h.as(o.userId, (tx) => addMeasurement(tx, g.id, measurementCreateSchema.parse({ measuredOn: "2026-10-01", value: 2 })));
    week = await h.as(o.userId, (tx) => getWeek(tx, W1));
    expect(week.scorecard.goals.averageCompletion).toBe(66.7);
    expect(week.scorecard.deliverables).toEqual({ planned: 1, delivered: 1, rate: 100 });
    expect(week.scorecard.score).toBe(80); // 0.6 × 66.7 + 0.4 × 100
    expect(week.goalsByArea.find((a) => a.area === "sales")!.goals[0].tasks).toHaveLength(7);
  });

  it("carries unfinished tasks forward and tracks chronic carry-overs", async () => {
    const o = await h.newOwner();
    const { month } = await monthly(o);
    const g = await h.as(o.userId, (tx) => createWeeklyGoal(tx, W1, weekly(month.id)));
    const t1 = await h.as(o.userId, (tx) => createTask(tx, taskCreateSchema.parse({ title: "Call list", goalId: g.id, dueOn: "2027-01-05", isDeliverable: true })));
    await h.as(o.userId, (tx) => createTask(tx, taskCreateSchema.parse({ title: "Script", goalId: g.id, plannedWeek: W1 })));

    const w2 = await h.as(o.userId, (tx) => getWeek(tx, W2));
    expect(w2.unfinished.map((t) => t.title).sort()).toEqual(["Call list", "Script"]);

    const moved = await h.as(o.userId, (tx) => carryForward(tx, t1.id));
    expect(moved).toMatchObject({ plannedWeek: W2, carriedFromWeek: W1, carryCount: 1, dueOn: null });
    expect(await h.as(o.userId, (tx) => carryForwardAll(tx, W2))).toEqual({ carried: 1 });
    await h.as(o.userId, (tx) => carryForward(tx, t1.id)); // into week 3
    const w3 = await h.as(o.userId, (tx) => getWeek(tx, "2027-01-18"));
    expect(w3.scorecard.tasks.chronic).toBe(1);

    const rescheduled = await h.as(o.userId, (tx) => rescheduleTask(tx, t1.id, "2027-01-28"));
    expect(rescheduled).toMatchObject({ dueOn: "2027-01-28", plannedWeek: "2027-01-25", carryCount: 3 });

    await h.as(o.userId, (tx) => updateTask(tx, t1.id, { status: "done" }));
    await expect(h.as(o.userId, (tx) => carryForward(tx, t1.id))).rejects.toMatchObject({ code: "task_closed" });
  });

  it("freezes the scorecard when the week is reviewed", async () => {
    const o = await h.newOwner();
    const { month } = await monthly(o);
    const g = await h.as(o.userId, (tx) => createWeeklyGoal(tx, W1, weekly(month.id)));
    const t = await h.as(o.userId, (tx) => createTask(tx, taskCreateSchema.parse({ title: "Proposal", goalId: g.id, plannedWeek: W1, isDeliverable: true })));
    await h.as(o.userId, (tx) => saveWeekPlan(tx, W1, { focus: "Pipeline", capacityHours: 12 }));
    const review = await h.as(o.userId, (tx) => reviewWeek(tx, W1, { wins: "Clear plan", lessons: "Start calls earlier", notes: null }));
    expect(review.reviewedAt).toBeInstanceOf(Date);
    expect(review.focus).toBe("Pipeline");

    await h.as(o.userId, (tx) => updateTask(tx, t.id, { status: "done" }));
    const after = await h.as(o.userId, (tx) => getWeek(tx, W1));
    expect(after.frozenScorecard?.deliverables).toMatchObject({ planned: 1, delivered: 0 });
    expect(after.scorecard.deliverables).toMatchObject({ planned: 1, delivered: 1 });
    expect(after.capacityHours).toBe(12);
  });
});
