import { afterAll, describe, expect, it } from "vitest";
import { goalCreateSchema, measurementCreateSchema, taskCreateSchema } from "../../src/features/goals/schemas";
import { addMeasurement, createGoal, createJourney, createTask, updateTask } from "../../src/features/goals/server/service";
import { answersSchema } from "../../src/features/review/schemas";
import { approveSuggestion, completeReview, getReview, saveReview, setNextWeekFocus } from "../../src/features/review/server/service";
import { prospectCreateSchema } from "../../src/features/sales/schemas";
import { createProspect } from "../../src/features/sales/server/service";
import { weeklyGoalCreateSchema } from "../../src/features/weekly/schemas";
import { createWeeklyGoal, getWeek } from "../../src/features/weekly/server/service";
import { addDays, todayIn } from "../../src/lib/domain/dates";
import { shiftWeek, weekOf } from "../../src/lib/domain/weekly";
import { connect } from "./helpers";

const h = connect();
afterAll(() => h.close());
const today = todayIn("UTC");
const thisWeek = weekOf(today, 1).weekStart;
const lastWeek = shiftWeek(thisWeek, -1);

async function owner() {
  const userId = await h.newUser();
  const ws = await h.as(userId, (tx) =>
    createJourney(tx, { name: "Journey", startDate: addDays(lastWeek, -60), timezone: "UTC", baseCurrency: "USD", weekStartsOn: 1, displayName: null }),
  );
  const pillar = (k: string) => ws.pillars.find((p) => p.key === k)!.id;
  const five = await h.as(userId, (tx) =>
    createGoal(tx, goalCreateSchema.parse({ title: "Top closer", pillarId: pillar("sales"), level: "five_year", category: "professional_identity", startDate: addDays(lastWeek, -60), targetDate: addDays(lastWeek, 1700), successMetric: "Revenue", targetValue: 100 })),
  );
  const monthly = (title: string, key: string) =>
    h.as(userId, (tx) =>
      createGoal(tx, goalCreateSchema.parse({ title, pillarId: pillar(key), level: "monthly", parentId: five.id, startDate: lastWeek, targetDate: addDays(thisWeek, 20), successMetric: "Count", unit: "count", measurementMode: "cumulative", targetValue: 10 })),
    );
  return { userId, pillar, sales: await monthly("Book 10 meetings", "sales"), brand: await monthly("Publish 8 posts", "brand") };
}

describe("weekly review", () => {
  it("reports on the week from tracked data, needs reasons for misses and freezes on completion", async () => {
    const o = await owner();
    const met = await h.as(o.userId, (tx) => createWeeklyGoal(tx, lastWeek, weeklyGoalCreateSchema.parse({ focusArea: "sales", parentId: o.sales.id, title: "Book 3 meetings", successMetric: "Meetings", targetValue: 3 })));
    const missed = await h.as(o.userId, (tx) => createWeeklyGoal(tx, lastWeek, weeklyGoalCreateSchema.parse({ focusArea: "sales", parentId: o.sales.id, title: "Send 50 cold emails", successMetric: "Emails", targetValue: 50 })));
    await h.as(o.userId, (tx) => addMeasurement(tx, met.id, measurementCreateSchema.parse({ measuredOn: addDays(lastWeek, 3), value: 3 })));
    await h.as(o.userId, (tx) => addMeasurement(tx, missed.id, measurementCreateSchema.parse({ measuredOn: addDays(lastWeek, 3), value: 12 })));
    const task = await h.as(o.userId, (tx) => createTask(tx, taskCreateSchema.parse({ title: "Proposal for Acme", plannedWeek: lastWeek, isDeliverable: true, estimatedMinutes: 60 })));
    await h.as(o.userId, (tx) => updateTask(tx, task.id, { status: "done", actualMinutes: 120 }));
    const routine = await h.as(o.userId, (tx) => createTask(tx, taskCreateSchema.parse({ title: "Inbox", plannedWeek: lastWeek, estimatedMinutes: 30 })));
    await h.as(o.userId, (tx) => updateTask(tx, routine.id, { status: "done", actualMinutes: 60 }));
    await h.as(o.userId, (tx) => createProspect(tx, prospectCreateSchema.parse({ name: "Priya" })));

    const r = await h.as(o.userId, (tx) => getReview(tx, lastWeek));
    expect(r.signals.goals.map((g) => [g.title, g.met])).toEqual([
      ["Book 3 meetings", true],
      ["Send 50 cold emails", false],
    ]);
    expect(r.signals.deliverables).toMatchObject({ planned: 1, delivered: 1 });
    expect(r.observations.map((x) => x.text)).toContain("Met 1 of 2 weekly goal(s) (50%).");
    expect(r.observations.map((x) => x.text)).toContain("Finished tasks took 2.0× their estimates.");
    expect(r.observations.map((x) => x.text)).toContain("3h logged on tasks; 33% of it on routine tasks that aren't deliverables.");
    // Personal branding has an active objective but nothing happened there.
    expect(r.observations.find((x) => x.pillar === "brand")?.text).toMatch(/no weekly goal or tracked activity/);
    expect(r.suggestions.map((s) => s.kind)).toEqual(["retry", "pillar_gap"]);

    // Draft saves; completing needs a reason for every miss.
    await h.as(o.userId, (tx) => saveReview(tx, lastWeek, answersSchema.parse({ biggestAchievement: "Acme proposal out" })));
    // A blank review can't be completed…
    await expect(h.as(o.userId, (tx) => completeReview(tx, lastWeek, answersSchema.parse({})))).rejects.toMatchObject({ code: "reflection_required" });
    // …and a reflection without reasons for the misses can't either.
    await expect(h.as(o.userId, (tx) => completeReview(tx, lastWeek, answersSchema.parse({ learned: "Proposals take twice as long" })))).rejects.toMatchObject({ code: "reasons_required" });
    const answers = answersSchema.parse({
      missed: [{ goalId: missed.id, reason: "too_ambitious", note: "50 was a guess" }],
      biggestAchievement: "Acme proposal out",
      learned: "Proposals take twice as long",
      stopDoing: "Writing emails one by one",
      changeNextWeek: "Batch outreach on Tuesday mornings",
    });
    const done = await h.as(o.userId, (tx) => completeReview(tx, lastWeek, answers));
    expect(done.completedAt).not.toBeNull();
    expect((done.snapshot as { observations: unknown[] }).observations.length).toBeGreaterThan(0);
    // The week is marked reviewed with its scorecard frozen.
    expect((await h.as(o.userId, (tx) => getWeek(tx, lastWeek))).plan).toMatchObject({ wins: "Acme proposal out", lessons: "Proposals take twice as long" });

    // "Too ambitious" turns the retry into a smaller target; approving creates next week's goal.
    const after = await h.as(o.userId, (tx) => getReview(tx, lastWeek));
    const smaller = after.suggestions.find((s) => s.kind === "smaller")!;
    expect(smaller).toMatchObject({ title: "Send 50 cold emails", targetValue: 25, approved: false });
    const created = await h.as(o.userId, (tx) =>
      approveSuggestion(tx, lastWeek, weeklyGoalCreateSchema.parse({ focusArea: smaller.focusArea, parentId: smaller.parentId, title: smaller.title, successMetric: smaller.successMetric, targetValue: 30 })),
    );
    expect(created).toMatchObject({ level: "weekly", startDate: thisWeek, targetValue: 30 });
    expect((await h.as(o.userId, (tx) => getReview(tx, lastWeek))).suggestions.find((s) => s.kind === "smaller")?.approved).toBe(true);
    const plan = await h.as(o.userId, (tx) => setNextWeekFocus(tx, lastWeek, answers.changeNextWeek!));
    expect(plan).toMatchObject({ weekStart: thisWeek, focus: "Batch outreach on Tuesday mornings" });

    // Future weeks can't be reviewed; other owners see nothing.
    await expect(h.as(o.userId, (tx) => getReview(tx, shiftWeek(thisWeek, 1)))).rejects.toMatchObject({ code: "week_not_started" });
    const other = await owner();
    expect((await h.as(other.userId, (tx) => getReview(tx, lastWeek))).review).toBeNull();
  });
});
