import { afterAll, describe, expect, it } from "vitest";
import { goalCreateSchema, measurementCreateSchema, taskCreateSchema } from "../../src/features/goals/schemas";
import {
  addDependency,
  addLink,
  addMeasurement,
  archiveGoal,
  createGoal,
  createTask,
  deleteMeasurement,
  getGoal,
  getGoalDetail,
  getGoalTree,
  listGoals,
  listVisionVersions,
  restoreGoal,
  saveVision,
  updateGoal,
  updateTask,
} from "../../src/features/goals/server/service";
import { AppError } from "../../src/lib/errors";
import { connect, rejectsWith } from "./helpers";

const h = connect();
afterAll(() => h.close());

type Owner = Awaited<ReturnType<typeof h.newOwner>>;

const fiveYear = (o: Owner, over: Record<string, unknown> = {}) =>
  goalCreateSchema.parse({
    title: "Net worth of $1M",
    pillarId: o.pillar("wealth"),
    level: "five_year",
    category: "financial",
    startDate: "2027-01-01",
    targetDate: "2031-12-31",
    successMetric: "Net worth",
    unit: "currency",
    currency: "USD",
    baselineValue: 0,
    targetValue: 1_000_000,
    ...over,
  });

const child = (o: Owner, parentId: string, level: string, startDate: string, targetDate: string, over: Record<string, unknown> = {}) =>
  goalCreateSchema.parse({
    title: `${level} goal`,
    pillarId: o.pillar("sales"),
    level,
    parentId,
    startDate,
    targetDate,
    successMetric: "Revenue closed",
    unit: "count",
    measurementMode: "cumulative",
    targetValue: 100,
    ...over,
  });

const measure = (measuredOn: string, value: number) => measurementCreateSchema.parse({ measuredOn, value });

describe("security", () => {
  it("enables RLS on every public table", async () => {
    const { rows } = await h.ownerPool.query(`
      select c.relname from pg_class c
       where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and not c.relrowsecurity`);
    expect(rows).toEqual([]);
  });

  it("denies the app role access to the auth schema and DDL", async () => {
    await expect(h.appPool.query("select count(*) from auth.users")).rejects.toThrow(/permission denied/);
    await expect(h.appPool.query("create table public.sneaky (id int)")).rejects.toThrow(/permission denied/);
  });

  it("isolates users and fails closed without a user", async () => {
    const a = await h.newOwner();
    const b = await h.newOwner();
    const goal = await h.as(a.userId, (tx) => createGoal(tx, fiveYear(a)));

    expect(await h.as(b.userId, (tx) => listGoals(tx, { includeArchived: true }))).toEqual([]);
    await expect(h.as(b.userId, (tx) => getGoalDetail(tx, goal.id))).rejects.toMatchObject({ status: 404 });

    const updated = await h.as(b.userId, (tx) => tx.execute(`update goals set title = 'hacked' where id = '${goal.id}'`));
    expect(updated.rowCount).toBe(0);
    expect((await h.as(a.userId, (tx) => getGoal(tx, goal.id))).title).toBe("Net worth of $1M");

    // B cannot attach a goal to A's journey or pillar (composite same-owner FKs).
    await rejectsWith(
      h.as(b.userId, (tx) =>
        tx.execute(
          `insert into goals (journey_id, level, category, pillar_id, title, start_date, target_date, success_metric, target_value)
           values ('${a.ws.journey.id}', 'five_year', 'other', '${a.pillar("sales")}', 'x', '2027-01-01', '2027-12-31', 'x', 1)`,
        ),
      ),
      { code: "23503" },
    );

    // B cannot forge A's user_id.
    await rejectsWith(
      h.as(b.userId, (tx) =>
        tx.execute(
          `insert into goals (user_id, journey_id, level, category, pillar_id, title, start_date, target_date, success_metric, target_value)
           values ('${a.userId}', '${a.ws.journey.id}', 'five_year', 'other', '${a.pillar("sales")}', 'x', '2027-01-01', '2027-12-31', 'x', 1)`,
        ),
      ),
      { code: "42501" },
    );

    // No app.user_id: nothing visible, nothing writable.
    expect((await h.appPool.query("select count(*)::int as n from goals")).rows[0].n).toBe(0);
    await expect(h.appPool.query("insert into pillars (key, name) values ('x1', 'X')")).rejects.toThrow();
  });
});

describe("outcome-based measurement", () => {
  it("refuses 'achieved' until the success metric reaches the target", async () => {
    const o = await h.newOwner();
    const goal = await h.as(o.userId, (tx) => createGoal(tx, fiveYear(o)));
    expect(goal.currentValue).toBe(0);
    expect(goal.completionPct).toBe(0);

    await rejectsWith(h.as(o.userId, (tx) => updateGoal(tx, goal.id, { status: "achieved" })), {
      detail: "achievement_requires_outcome",
    });

    await h.as(o.userId, (tx) => addMeasurement(tx, goal.id, measure("2026-10-01", 400_000)));
    expect((await h.as(o.userId, (tx) => getGoal(tx, goal.id))).completionPct).toBe(40);

    const { goal: met } = await h.as(o.userId, (tx) => addMeasurement(tx, goal.id, measure("2026-10-01", 1_050_000)));
    expect(met.isTargetMet).toBe(true);
    expect(met.completionPct).toBe(100);

    const achieved = await h.as(o.userId, (tx) => updateGoal(tx, goal.id, { status: "achieved" }));
    expect(achieved.status).toBe("achieved");
    expect(achieved.achievedAt).toBeInstanceOf(Date);
  });

  it("does not complete a goal when all of its tasks are done", async () => {
    const o = await h.newOwner();
    const goal = await h.as(o.userId, (tx) => createGoal(tx, fiveYear(o)));
    const t1 = await h.as(o.userId, (tx) => createTask(tx, taskCreateSchema.parse({ title: "Open brokerage account", goalId: goal.id })));
    const t2 = await h.as(o.userId, (tx) => createTask(tx, taskCreateSchema.parse({ title: "Automate savings", goalId: goal.id })));
    await h.as(o.userId, (tx) => updateTask(tx, t1.id, { status: "done" }));
    const done2 = await h.as(o.userId, (tx) => updateTask(tx, t2.id, { status: "done" }));
    expect(done2.completedAt).toBeInstanceOf(Date);

    const detail = await h.as(o.userId, (tx) => getGoalDetail(tx, goal.id));
    expect(detail.taskSummary).toEqual({ total: 2, done: 2 });
    expect(detail.goal.completionPct).toBe(0);
    expect(detail.goal.status).toBe("not_started");
    expect(detail.achievement.allowed).toBe(false);
    await rejectsWith(h.as(o.userId, (tx) => updateGoal(tx, goal.id, { status: "achieved" })), {
      detail: "achievement_requires_outcome",
    });
  });

  it("does not complete a parent when its sub-goals are achieved", async () => {
    const o = await h.newOwner();
    const parent = await h.as(o.userId, (tx) => createGoal(tx, fiveYear(o)));
    const annual = await h.as(o.userId, (tx) =>
      createGoal(tx, child(o, parent.id, "annual", "2027-01-01", "2027-12-31", { targetValue: 10 })),
    );
    await h.as(o.userId, (tx) => addMeasurement(tx, annual.id, measure("2026-10-01", 10)));
    await h.as(o.userId, (tx) => updateGoal(tx, annual.id, { status: "achieved" }));

    const detail = await h.as(o.userId, (tx) => getGoalDetail(tx, parent.id));
    expect(detail.childSummary).toMatchObject({ total: 1, achieved: 1 });
    expect(detail.goal.completionPct).toBe(0);
    expect(detail.goal.category).toBe("financial");
  });

  it("derives current value from measurements and ignores direct writes", async () => {
    const o = await h.newOwner();
    const latest = await h.as(o.userId, (tx) => createGoal(tx, fiveYear(o, { baselineValue: 100_000 })));
    await h.as(o.userId, (tx) => addMeasurement(tx, latest.id, measure("2026-05-31", 300_000)));
    const { measurement } = await h.as(o.userId, (tx) => addMeasurement(tx, latest.id, measure("2026-09-30", 500_000)));
    await h.as(o.userId, (tx) => addMeasurement(tx, latest.id, measure("2026-03-31", 900_000))); // older date, not latest
    let g = await h.as(o.userId, (tx) => getGoal(tx, latest.id));
    expect(g.currentValue).toBe(500_000);
    expect(g.currentValueAsOf).toBe("2026-09-30");
    expect(g.completionPct).toBe(44.4); // (500k-100k)/(1M-100k)

    await h.as(o.userId, (tx) => deleteMeasurement(tx, latest.id, measurement.id));
    g = await h.as(o.userId, (tx) => getGoal(tx, latest.id));
    expect(g.currentValue).toBe(300_000);

    await h.as(o.userId, (tx) => tx.execute(`update goals set current_value = 999999999 where id = '${latest.id}'`));
    expect((await h.as(o.userId, (tx) => getGoal(tx, latest.id))).currentValue).toBe(300_000);

    const cumulative = await h.as(o.userId, (tx) =>
      createGoal(tx, child(o, latest.id, "annual", "2027-01-01", "2027-12-31", { targetValue: 50 })),
    );
    await h.as(o.userId, (tx) => addMeasurement(tx, cumulative.id, measure("2026-10-01", 12)));
    await h.as(o.userId, (tx) => addMeasurement(tx, cumulative.id, measure("2026-10-01", 13)));
    g = await h.as(o.userId, (tx) => getGoal(tx, cumulative.id));
    expect(g.currentValue).toBe(25);
    expect(g.completionPct).toBe(50);
  });

  it("measures decrease goals such as paying off debt", async () => {
    const o = await h.newOwner();
    const debt = await h.as(o.userId, (tx) =>
      createGoal(tx, fiveYear(o, { title: "Debt free", baselineValue: 50_000, targetValue: 0, successMetric: "Total debt" })),
    );
    expect(debt.direction).toBe("decrease");
    const { goal } = await h.as(o.userId, (tx) => addMeasurement(tx, debt.id, measure("2026-10-01", 20_000)));
    expect(goal.completionPct).toBe(60);
    expect(goal.isTargetMet).toBe(false);
  });

  it("rejects measurements dated in the future", async () => {
    const o = await h.newOwner();
    const goal = await h.as(o.userId, (tx) => createGoal(tx, fiveYear(o)));
    await expect(h.as(o.userId, (tx) => addMeasurement(tx, goal.id, measure("2999-01-01", 1_000_000)))).rejects.toMatchObject({
      code: "measurement_in_future",
    });
    // The database enforces it too, independent of the service.
    await rejectsWith(
      h.as(o.userId, (tx) =>
        tx.execute(`insert into goal_measurements (goal_id, measured_on, value) values ('${goal.id}', '2999-01-01', 1)`),
      ),
      { detail: "measurement_in_future" },
    );
  });

  it("accepts only 0 or 1 for yes/no outcomes", async () => {
    const o = await h.newOwner();
    const exit = await h.as(o.userId, (tx) =>
      createGoal(
        tx,
        fiveYear(o, {
          title: "Resign from employment",
          category: "exit_condition",
          unit: "boolean",
          currency: null,
          baselineValue: 0,
          targetValue: 1,
          successMetric: "Exit conditions met and resignation submitted",
        }),
      ),
    );
    await rejectsWith(h.as(o.userId, (tx) => addMeasurement(tx, exit.id, measure("2026-10-01", 2))), {
      detail: "boolean_measurement",
    });
    const { goal } = await h.as(o.userId, (tx) => addMeasurement(tx, exit.id, measure("2026-10-01", 1)));
    expect(goal.isTargetMet).toBe(true);
  });
});

describe("hierarchy", () => {
  it("supports five-year → annual → quarterly → monthly → weekly → daily", async () => {
    const o = await h.newOwner();
    const vision = await h.as(o.userId, (tx) => createGoal(tx, fiveYear(o)));
    const annual = await h.as(o.userId, (tx) => createGoal(tx, child(o, vision.id, "annual", "2027-01-01", "2027-12-31")));
    const quarter = await h.as(o.userId, (tx) => createGoal(tx, child(o, annual.id, "quarterly", "2027-01-01", "2027-03-31")));
    const month = await h.as(o.userId, (tx) => createGoal(tx, child(o, quarter.id, "monthly", "2027-01-01", "2027-01-31")));
    const week = await h.as(o.userId, (tx) =>
      createGoal(tx, child(o, month.id, "weekly", "2027-01-04", "2027-01-10", { focusArea: "sales" })),
    );
    await h.as(o.userId, (tx) =>
      createGoal(tx, child(o, week.id, "daily", "2027-01-04", "2027-01-04", { title: "Make 50 dials", successMetric: "Dials" })),
    );

    const { tree, byLevel } = await h.as(o.userId, (tx) => getGoalTree(tx));
    let depth = 0;
    let node = tree[0];
    while (node) {
      depth++;
      node = node.children[0];
    }
    expect(depth).toBe(6);
    expect(byLevel).toMatchObject({ five_year: 1, annual: 1, quarterly: 1, monthly: 1, weekly: 1, daily: 1 });

    const detail = await h.as(o.userId, (tx) => getGoalDetail(tx, week.id));
    expect(detail.ancestors.map((a) => a.level)).toEqual(["five_year", "annual", "quarterly", "monthly"]);
  });

  it("rejects invalid parents, periods and journeys", async () => {
    const o = await h.newOwner();
    const vision = await h.as(o.userId, (tx) => createGoal(tx, fiveYear(o)));
    const quarter = await h.as(o.userId, (tx) => createGoal(tx, child(o, vision.id, "quarterly", "2027-01-01", "2027-03-31")));

    await rejectsWith(h.as(o.userId, (tx) => createGoal(tx, child(o, quarter.id, "annual", "2027-01-01", "2027-03-31"))), {
      detail: "invalid_parent_level",
    });
    await rejectsWith(h.as(o.userId, (tx) => createGoal(tx, child(o, quarter.id, "monthly", "2027-03-15", "2027-04-14"))), {
      detail: "outside_parent_period",
    });
    await rejectsWith(h.as(o.userId, (tx) => updateGoal(tx, quarter.id, { targetDate: "2027-02-28" }).then(() =>
      createGoal(tx, child(o, quarter.id, "monthly", "2027-02-01", "2027-02-28")),
    ).then((m) => updateGoal(tx, quarter.id, { targetDate: "2027-01-31" }).then(() => m))), {
      detail: "children_conflict",
    });
    await rejectsWith(h.as(o.userId, (tx) => createGoal(tx, fiveYear(o, { targetDate: "2033-12-31" }))), {
      detail: "goal_outside_journey",
    });
    expect(() => goalCreateSchema.parse({ ...fiveYear(o), parentId: vision.id })).toThrow(/top and have no parent/);
  });

  it("archives a goal with its descendants and restores them", async () => {
    const o = await h.newOwner();
    const vision = await h.as(o.userId, (tx) => createGoal(tx, fiveYear(o)));
    const annual = await h.as(o.userId, (tx) => createGoal(tx, child(o, vision.id, "annual", "2027-01-01", "2027-12-31")));
    expect(await h.as(o.userId, (tx) => archiveGoal(tx, vision.id))).toEqual({ archived: 2 });
    expect(await h.as(o.userId, (tx) => listGoals(tx, {}))).toHaveLength(0);
    await expect(h.as(o.userId, (tx) => restoreGoal(tx, annual.id))).rejects.toMatchObject({ code: "parent_archived" });
    await h.as(o.userId, (tx) => restoreGoal(tx, vision.id));
    expect(await h.as(o.userId, (tx) => listGoals(tx, {}))).toHaveLength(2);
  });
});

describe("dependencies and related goals", () => {
  it("rejects cycles and self-dependencies", async () => {
    const o = await h.newOwner();
    const [a, b, c] = await Promise.all(
      ["A", "B", "C"].map((title) => h.as(o.userId, (tx) => createGoal(tx, fiveYear(o, { title })))),
    );
    await h.as(o.userId, (tx) => addDependency(tx, a.id, { dependsOnGoalId: b.id, isBlocking: true, note: null }));
    await h.as(o.userId, (tx) => addDependency(tx, b.id, { dependsOnGoalId: c.id, isBlocking: true, note: null }));
    await rejectsWith(h.as(o.userId, (tx) => addDependency(tx, c.id, { dependsOnGoalId: a.id, isBlocking: true, note: null })), {
      detail: "dependency_cycle",
    });
    await expect(
      h.as(o.userId, (tx) => addDependency(tx, a.id, { dependsOnGoalId: a.id, isBlocking: true, note: null })),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("blocks achievement until blocking prerequisites are achieved", async () => {
    const o = await h.newOwner();
    const business = await h.as(o.userId, (tx) =>
      createGoal(tx, fiveYear(o, { title: "Own a SaaS company", category: "business_ownership", targetValue: 1, unit: "boolean", currency: null, successMetric: "Company incorporated and profitable" })),
    );
    const exit = await h.as(o.userId, (tx) =>
      createGoal(tx, fiveYear(o, { title: "Leave employment", category: "exit_condition", targetValue: 1, unit: "boolean", currency: null, successMetric: "Resigned" })),
    );
    const brand = await h.as(o.userId, (tx) =>
      createGoal(tx, fiveYear(o, { title: "Audience of 100k", category: "personal_brand", unit: "count", currency: null, targetValue: 100_000, successMetric: "Followers" })),
    );
    await h.as(o.userId, (tx) => addDependency(tx, exit.id, { dependsOnGoalId: business.id, isBlocking: true, note: "Need income first" }));
    await h.as(o.userId, (tx) => addDependency(tx, exit.id, { dependsOnGoalId: brand.id, isBlocking: false, note: null }));
    await h.as(o.userId, (tx) => addMeasurement(tx, exit.id, measure("2026-10-01", 1)));

    let detail = await h.as(o.userId, (tx) => getGoalDetail(tx, exit.id));
    expect(detail.blockers.map((b) => b.title)).toEqual(["Own a SaaS company"]);
    expect(detail.achievement.allowed).toBe(false);
    await rejectsWith(h.as(o.userId, (tx) => updateGoal(tx, exit.id, { status: "achieved" })), {
      detail: "blocked_by_dependencies",
    });

    await h.as(o.userId, (tx) => addMeasurement(tx, business.id, measure("2026-10-01", 1)));
    await h.as(o.userId, (tx) => updateGoal(tx, business.id, { status: "achieved" }));
    detail = await h.as(o.userId, (tx) => getGoalDetail(tx, exit.id));
    expect(detail.achievement.allowed).toBe(true);
    expect((await h.as(o.userId, (tx) => updateGoal(tx, exit.id, { status: "achieved" }))).status).toBe("achieved");

    const businessDetail = await h.as(o.userId, (tx) => getGoalDetail(tx, business.id));
    expect(businessDetail.dependents.map((d) => d.goal.title)).toEqual(["Leave employment"]);
  });

  it("stores related goals once per pair, in either direction", async () => {
    const o = await h.newOwner();
    const a = await h.as(o.userId, (tx) => createGoal(tx, fiveYear(o, { title: "A" })));
    const b = await h.as(o.userId, (tx) => createGoal(tx, fiveYear(o, { title: "B" })));
    await h.as(o.userId, (tx) => addLink(tx, b.id, { relatedGoalId: a.id, kind: "synergy", note: null }));
    await rejectsWith(h.as(o.userId, (tx) => addLink(tx, a.id, { relatedGoalId: b.id, kind: "related", note: null })), {
      code: "23505",
    });
    const fromA = await h.as(o.userId, (tx) => getGoalDetail(tx, a.id));
    const fromB = await h.as(o.userId, (tx) => getGoalDetail(tx, b.id));
    expect(fromA.links.map((l) => [l.goal.title, l.kind])).toEqual([["B", "synergy"]]);
    expect(fromB.links.map((l) => l.goal.title)).toEqual(["A"]);
  });
});

describe("vision", () => {
  it("keeps every version and marks the latest current", async () => {
    const o = await h.newOwner();
    await h.as(o.userId, (tx) =>
      saveVision(tx, { title: "Five-year vision", statement: "v1", professionalIdentity: "Closer", exitStrategy: null }),
    );
    const v2 = await h.as(o.userId, (tx) =>
      saveVision(tx, { title: "Five-year vision", statement: "v2", professionalIdentity: "Founder", exitStrategy: "When MRR ≥ salary" }),
    );
    expect(v2.version).toBe(2);
    const versions = await h.as(o.userId, (tx) => listVisionVersions(tx, o.ws.journey.id));
    expect(versions.map((v) => [v.version, v.isCurrent])).toEqual([
      [2, true],
      [1, false],
    ]);
  });
});
