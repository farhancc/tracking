import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { habitCheckins, habits, tasks } from "../../src/db/schema";
import { habitCreateSchema } from "../../src/features/habits/schemas";
import {
  addRestDay,
  addSuggestedHabits,
  checkIn,
  createHabit,
  deleteHabit,
  getHabitHistory,
  getHabitsOverview,
  updateHabit,
} from "../../src/features/habits/server/service";
import { addDays, todayIn } from "../../src/lib/domain/dates";
import { connect, rejectsWith } from "./helpers";

const h = connect();
afterAll(() => h.close());
const today = todayIn("UTC");

describe("habit tracker", () => {
  it("starts with the nine habits from the plan and lets you edit and delete them", async () => {
    const o = await h.newOwner();
    const ov = await h.as(o.userId, (tx) => getHabitsOverview(tx));
    expect(ov.items.map((i) => i.habit.name)).toEqual([
      "Wake up on time",
      "Exercise",
      "Read",
      "Practice communication",
      "Study sales",
      "Work on my product",
      "Publish or prepare content",
      "Review daily goals",
      "Sleep on time",
    ]);
    const exercise = ov.items.find((i) => i.habit.name === "Exercise")!.habit;
    expect(exercise).toMatchObject({ scheduleKind: "weekly", weeklyTarget: 3, startedOn: today });
    expect(await h.as(o.userId, (tx) => addSuggestedHabits(tx))).toBe(0);
    // Only seeded once.
    expect((await h.as(o.userId, (tx) => getHabitsOverview(tx))).items.length).toBe(9);

    const renamed = await h.as(o.userId, (tx) => updateHabit(tx, exercise.id, { name: "Strength training", weeklyTarget: 2 }));
    expect(renamed).toMatchObject({ name: "Strength training", weeklyTarget: 2, scheduleKind: "weekly" });
    const daily = await h.as(o.userId, (tx) => updateHabit(tx, exercise.id, { scheduleKind: "days", scheduleDays: [1, 3, 5] }));
    expect(daily.weeklyTarget).toBeNull();
    await expect(h.as(o.userId, (tx) => updateHabit(tx, exercise.id, { scheduleKind: "weekly" }))).rejects.toMatchObject({ code: "validation_failed" });

    await h.as(o.userId, (tx) => checkIn(tx, exercise.id, { status: "done", note: null }));
    const res = await h.as(o.userId, (tx) => deleteHabit(tx, exercise.id));
    expect(res).toEqual({ deleted: "Strength training", checkinsDeleted: 1 });
    expect(await h.as(o.userId, (tx) => tx.select().from(habitCheckins).where(eq(habitCheckins.habitId, exercise.id)))).toEqual([]);
  });

  it("measures consistency and streaks with rest days, backfilling and no future check-ins", async () => {
    const o = await h.newOwner();
    await h.as(o.userId, (tx) => tx.insert(habits).values({ name: "Placeholder" })); // skip the defaults
    const hb = await h.as(o.userId, (tx) => createHabit(tx, habitCreateSchema.parse({ name: "Daily writing" })));
    expect(hb.startedOn).toBe(today);
    // Backfilling 10 days moves the start back.
    for (let i = 10; i >= 1; i--) {
      if (i === 6) continue; // a missed day
      await h.as(o.userId, (tx) => checkIn(tx, hb.id, { day: addDays(today, -i), status: i === 3 ? "rest" : "done", note: null }));
    }
    await h.as(o.userId, (tx) => checkIn(tx, hb.id, { day: addDays(today, -6), status: "skipped", note: "Flight" }));
    expect((await h.as(o.userId, (tx) => tx.select().from(habits).where(eq(habits.id, hb.id))))[0].startedOn).toBe(addDays(today, -10));
    await rejectsWith(h.as(o.userId, (tx) => checkIn(tx, hb.id, { day: addDays(today, 1), status: "done", note: null })), { detail: "checkin_in_future" });

    let ov = await h.as(o.userId, (tx) => getHabitsOverview(tx));
    let item = ov.items.find((i) => i.habit.id === hb.id)!;
    // Today pending: 5 done since the miss (−5,−4,−2,−1 done, −3 rest) → 4-day streak; best is also 4 (before the miss: −10…−7).
    expect(item.streak).toEqual({ current: 4, best: 4, unit: "days" });
    expect(item.today.state).toBe("pending");
    expect(item.last30).toEqual({ done: 8, expected: 9, rate: 8 / 9 });
    expect(item.missed.reasons).toEqual([{ day: addDays(today, -6), note: "Flight" }]);

    // A global rest day today excuses every habit.
    await h.as(o.userId, (tx) => addRestDay(tx, { day: today, reason: "Sick" }));
    ov = await h.as(o.userId, (tx) => getHabitsOverview(tx));
    item = ov.items.find((i) => i.habit.id === hb.id)!;
    expect(ov.isRestDay).toBe(true);
    expect(item.today.state).toBe("rest");

    const hist = await h.as(o.userId, (tx) => getHabitHistory(tx, hb.id));
    expect(hist.totalDone).toBe(8);
    expect(hist.weeks.flatMap((w) => w.days).find((d) => d.day === addDays(today, -6))?.state).toBe("missed");

    const other = await h.newOwner();
    await expect(h.as(other.userId, (tx) => checkIn(tx, hb.id, { status: "done", note: null }))).rejects.toMatchObject({ status: 404 });
  });

  it("compares how many of the day's priorities got done on habit days vs other days", async () => {
    const o = await h.newOwner();
    await h.as(o.userId, (tx) => tx.insert(habits).values({ name: "Placeholder", scheduleDays: [0] }));
    const hb = await h.as(o.userId, (tx) => createHabit(tx, habitCreateSchema.parse({ name: "Morning planning", startedOn: addDays(today, -30) })));
    for (let i = 1; i <= 20; i++) {
      const day = addDays(today, -i);
      const did = i % 2 === 0;
      if (did) await h.as(o.userId, (tx) => checkIn(tx, hb.id, { day, status: "done", note: null }));
      // Two MITs a day: both done on habit days, one on other days.
      for (const rank of [1, 2]) {
        const done = did || rank === 1;
        await h.as(o.userId, async (tx) => {
          const [t] = await tx.insert(tasks).values({ title: `MIT ${rank} ${day}`, mitOn: day, mitRank: rank, scheduledOn: day, status: done ? "done" : "todo" }).returning();
          // Completion is stamped "now" on insert; backdate it to that afternoon.
          if (done) await tx.update(tasks).set({ completedAt: new Date(`${day}T15:00:00Z`) }).where(eq(tasks.id, t.id));
        });
      }
    }
    const ov = await h.as(o.userId, (tx) => getHabitsOverview(tx));
    const c = ov.correlations.find((x) => x.habitId === hb.id)!;
    expect(c).toMatchObject({ doneDays: 10, otherDays: 10, doneAvg: 1, otherAvg: 0.5, enough: true });
    expect(c.difference).toBeCloseTo(0.5);
  });
});
