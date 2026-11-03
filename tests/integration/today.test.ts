import { afterAll, describe, expect, it } from "vitest";
import { goalCreateSchema, taskCreateSchema } from "../../src/features/goals/schemas";
import { createGoal, createTask, updateTask } from "../../src/features/goals/server/service";
import { habitCreateSchema, quickTaskSchema } from "../../src/features/today/schemas";
import {
  addTodayTask,
  carryOverdueToToday,
  checkInHabit,
  createHabit,
  finishTask,
  getToday,
  saveDayPlan,
  saveReflection,
  scheduleForToday,
  setMit,
  startTask,
} from "../../src/features/today/server/service";
import { createWeeklyGoal } from "../../src/features/weekly/server/service";
import { weeklyGoalCreateSchema } from "../../src/features/weekly/schemas";
import { connect, rejectsWith } from "./helpers";

const h = connect();
afterAll(() => h.close());

const DAY = "2027-01-06"; // Wednesday in week 2027-01-04
const quick = (title: string, over: Record<string, unknown> = {}) => quickTaskSchema.parse({ title, ...over });

describe("today's mission", () => {
  it("keeps exactly one task per MIT slot", async () => {
    const o = await h.newOwner();
    const a = await h.as(o.userId, (tx) => addTodayTask(tx, quick("Ship landing page", { mitRank: 1, estimatedMinutes: 120 }), DAY));
    const b = await h.as(o.userId, (tx) => addTodayTask(tx, quick("Call 20 prospects", { estimatedMinutes: 90 }), DAY));
    await h.as(o.userId, (tx) => setMit(tx, 2, b.id, DAY));
    await h.as(o.userId, (tx) => setMit(tx, 1, b.id, DAY)); // b moves to slot 1, a leaves the mission
    const t = await h.as(o.userId, (tx) => getToday(tx, DAY));
    expect(t.mits.map((m) => m.task?.title ?? null)).toEqual(["Call 20 prospects", null, null]);
    expect(t.tasks.map((x) => x.title)).toContain("Ship landing page"); // still scheduled today
    expect(a.plannedWeek).toBe("2027-01-04");
  });

  it("pulls a task from last week into today and counts it as a carry", async () => {
    const o = await h.newOwner();
    const old = await h.as(o.userId, (tx) => createTask(tx, taskCreateSchema.parse({ title: "Write proposal", plannedWeek: "2026-12-28" })));
    const moved = await h.as(o.userId, (tx) => scheduleForToday(tx, old.id, DAY));
    expect(moved).toMatchObject({ scheduledOn: DAY, plannedWeek: "2027-01-04", carryCount: 1, carriedFromWeek: "2026-12-28" });
  });

  it("carries overdue tasks into today", async () => {
    const o = await h.newOwner();
    await h.as(o.userId, (tx) => addTodayTask(tx, quick("Follow up with Acme"), "2027-01-05"));
    const before = await h.as(o.userId, (tx) => getToday(tx, DAY));
    expect(before.overdue.map((t) => t.title)).toEqual(["Follow up with Acme"]);
    expect(await h.as(o.userId, (tx) => carryOverdueToToday(tx, DAY))).toEqual({ carried: 1 });
    const after = await h.as(o.userId, (tx) => getToday(tx, DAY));
    expect(after.overdue).toHaveLength(0);
    expect(after.tasks.map((t) => t.title)).toEqual(["Follow up with Acme"]);
  });
});

describe("execution", () => {
  it("records start and finish times and derives the actual duration", async () => {
    const o = await h.newOwner();
    const t = await h.as(o.userId, (tx) => addTodayTask(tx, quick("Deep work: MVP onboarding", { estimatedMinutes: 30 }), DAY));
    const started = await h.as(o.userId, (tx) => startTask(tx, t.id));
    expect(started.status).toBe("doing");
    await h.as(o.userId, (tx) => tx.execute(`update tasks set started_at = now() - interval '25 minutes' where id = '${t.id}'`));
    const done = await h.as(o.userId, (tx) => finishTask(tx, t.id));
    expect(done.status).toBe("done");
    expect(done.actualMinutes).toBe(25);
    expect(done.finishedAt).toBeInstanceOf(Date);

    // A manually logged duration is kept.
    const m = await h.as(o.userId, (tx) => addTodayTask(tx, quick("Email batch"), DAY));
    await h.as(o.userId, (tx) => startTask(tx, m.id));
    await h.as(o.userId, (tx) => updateTask(tx, m.id, { actualMinutes: 40 }));
    expect((await h.as(o.userId, (tx) => finishTask(tx, m.id))).actualMinutes).toBe(40);
  });

  it("computes daily progress and available versus planned time", async () => {
    const o = await h.newOwner();
    const mit = await h.as(o.userId, (tx) => addTodayTask(tx, quick("MIT", { mitRank: 1, estimatedMinutes: 60 }), DAY));
    await h.as(o.userId, (tx) => addTodayTask(tx, quick("Other", { estimatedMinutes: 60 }), DAY));
    await h.as(o.userId, (tx) => saveDayPlan(tx, 180, DAY));
    let t = await h.as(o.userId, (tx) => getToday(tx, DAY));
    expect(t.progress.pct).toBe(0);
    expect([t.availableMinutes, t.plannedMinutes, t.openMinutes]).toEqual([180, 120, 120]);
    await h.as(o.userId, (tx) => finishTask(tx, mit.id));
    t = await h.as(o.userId, (tx) => getToday(tx, DAY));
    expect(t.progress.pct).toBe(63); // MIT 1/1 (0.5) + other 0/60 (0.3) → 0.5/0.8
    expect(t.openMinutes).toBe(60);
  });
});

describe("habits and reflection", () => {
  it("shows scheduled habits and records check-ins, never in the future", async () => {
    const o = await h.newOwner();
    const read = await h.as(o.userId, (tx) => createHabit(tx, habitCreateSchema.parse({ name: "Read 20 pages", scheduleDays: [1, 3, 5] })));
    await h.as(o.userId, (tx) => createHabit(tx, habitCreateSchema.parse({ name: "Long run", scheduleDays: [0] })));
    const monday = "2026-11-02";
    let t = await h.as(o.userId, (tx) => getToday(tx, monday));
    expect(t.habits.map((x) => [x.name, x.status])).toEqual([["Read 20 pages", null]]);
    await h.as(o.userId, (tx) => checkInHabit(tx, read.id, "done", monday));
    t = await h.as(o.userId, (tx) => getToday(tx, monday));
    expect(t.habits[0].status).toBe("done");
    expect(t.progress.pct).toBe(100);
    await h.as(o.userId, (tx) => checkInHabit(tx, read.id, null, monday));
    expect((await h.as(o.userId, (tx) => getToday(tx, monday))).habits[0].status).toBeNull();
    await rejectsWith(h.as(o.userId, (tx) => checkInHabit(tx, read.id, "done", "2999-01-04")), { detail: "checkin_in_future" });
  });

  it("saves the daily reflection", async () => {
    const o = await h.newOwner();
    const r = await h.as(o.userId, (tx) =>
      saveReflection(tx, { accomplished: "Shipped onboarding", learned: "Batch calls", wentWrong: "Late start", improveTomorrow: "Start at 7" }, DAY),
    );
    expect(r.reflectedAt).toBeInstanceOf(Date);
    expect((await h.as(o.userId, (tx) => getToday(tx, DAY))).plan?.improveTomorrow).toBe("Start at 7");
  });
});

describe("direction", () => {
  it("shows the annual and quarterly objectives and this week's priorities", async () => {
    const o = await h.newOwner();
    const five = await h.as(o.userId, (tx) =>
      createGoal(tx, goalCreateSchema.parse({ title: "Own a SaaS", pillarId: o.pillar("product"), level: "five_year", category: "business_ownership", startDate: "2027-01-01", targetDate: "2031-12-31", successMetric: "Customers", targetValue: 200 })),
    );
    const annual = await h.as(o.userId, (tx) =>
      createGoal(tx, goalCreateSchema.parse({ title: "First 10 customers", pillarId: o.pillar("product"), level: "annual", parentId: five.id, startDate: "2027-01-01", targetDate: "2027-12-31", successMetric: "Customers", targetValue: 10 })),
    );
    await h.as(o.userId, (tx) =>
      createGoal(tx, goalCreateSchema.parse({ title: "Validate the problem", pillarId: o.pillar("product"), level: "quarterly", parentId: annual.id, startDate: "2027-01-01", targetDate: "2027-03-31", successMetric: "Key results", measurementMode: "key_results", targetValue: 100 })),
    );
    await h.as(o.userId, (tx) =>
      createWeeklyGoal(tx, "2027-01-04", weeklyGoalCreateSchema.parse({ focusArea: "product", parentId: annual.id, title: "5 interviews", successMetric: "Interviews", targetValue: 5 })),
    );
    const t = await h.as(o.userId, (tx) => getToday(tx, DAY));
    expect(t.journey).toMatchObject({ day: 6, total: 1826, year: 1 });
    expect(t.annualObjectives.map((g) => g.title)).toEqual(["First 10 customers"]);
    expect(t.quarterlyObjectives.map((g) => g.title)).toEqual(["Validate the problem"]);
    expect(t.weekPriorities.map((g) => g.title)).toEqual(["5 interviews"]);
  });
});
