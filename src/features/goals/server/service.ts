/**
 * Goal engine service: every read and write of the strategic goal system.
 *
 * Functions take a `tx` that is already scoped to one user by withUser() /
 * runAsUser(), so RLS guarantees they only ever see that user's rows. The REST
 * API (src/app/api/v1) and the Server Actions both call these functions.
 */
import { and, asc, desc, eq, ilike, isNull, ne, sql, type SQL } from "drizzle-orm";
import type { Tx } from "@/db/drizzle";
import {
  goalDependencies,
  goalLinks,
  goalMeasurements,
  goals,
  journeys,
  pillars,
  profiles,
  tasks,
  visions,
} from "@/db/schema";
import { addDays, addYears, todayIn, type IsoDate } from "@/lib/domain/dates";
import {
  buildTree,
  canMarkAchieved,
  expectedPercent,
  goalDirection,
  goalHealth,
  summarizeChildren,
  summarizeTasks,
  type GoalLevel,
  type GoalStatus,
  type Prerequisite,
  type TreeNode,
} from "@/lib/domain/goals";
import { AppError, notFound } from "@/lib/errors";
import type {
  DependencyCreateInput,
  GoalCreateInput,
  GoalListQuery,
  GoalUpdateInput,
  JourneyCreateInput,
  LinkCreateInput,
  MeasurementCreateInput,
  TaskCreateInput,
  TaskUpdateInput,
  VisionSaveInput,
} from "../schemas";

export type GoalRow = typeof goals.$inferSelect;
export type PillarRow = typeof pillars.$inferSelect;
export type JourneyRow = typeof journeys.$inferSelect;
export type VisionRow = typeof visions.$inferSelect;
export type MeasurementRow = typeof goalMeasurements.$inferSelect;
export type TaskRow = typeof tasks.$inferSelect;

export type GoalView = GoalRow & {
  direction: "increase" | "decrease";
  expectedPct: number;
  health: ReturnType<typeof goalHealth>;
};

export type GoalSummary = Pick<
  GoalRow,
  | "id"
  | "parentId"
  | "title"
  | "level"
  | "category"
  | "status"
  | "completionPct"
  | "isTargetMet"
  | "pillarId"
  | "startDate"
  | "targetDate"
  | "archivedAt"
>;

export const DEFAULT_PILLARS = [
  {
    key: "sales",
    name: "Sales mastery",
    description: "Prospecting, cold calling, communication, persuasion, negotiation and closing.",
    color: "#2563eb",
    sortOrder: 1,
  },
  {
    key: "product",
    name: "Product entrepreneurship",
    description: "Identifying problems, building software, launching products, acquiring customers and generating revenue.",
    color: "#7c3aed",
    sortOrder: 2,
  },
  {
    key: "brand",
    name: "Personal branding",
    description: "Content about communication, sales psychology, human behaviour and entrepreneurship.",
    color: "#db2777",
    sortOrder: 3,
  },
  {
    key: "wealth",
    name: "Financial independence",
    description: "Income, savings, debt reduction, business assets and financial independence.",
    color: "#059669",
    sortOrder: 4,
  },
] as const;

const summaryColumns = {
  id: goals.id,
  parentId: goals.parentId,
  title: goals.title,
  level: goals.level,
  category: goals.category,
  startDate: goals.startDate,
  status: goals.status,
  completionPct: goals.completionPct,
  isTargetMet: goals.isTargetMet,
  pillarId: goals.pillarId,
  targetDate: goals.targetDate,
  archivedAt: goals.archivedAt,
};

const levelOrder = sql`app.goal_level_rank(${goals.level})`;

export function decorateGoal(goal: GoalRow, today: IsoDate): GoalView {
  return {
    ...goal,
    direction: goalDirection(goal),
    expectedPct: expectedPercent(goal, today),
    health: goalHealth(goal, today),
  };
}

// ---------------------------------------------------------------------------
// Workspace: profile, active journey, pillars
// ---------------------------------------------------------------------------

export async function getWorkspace(tx: Tx) {
  const [profile] = await tx.select().from(profiles).limit(1);
  const [journey] = await tx.select().from(journeys).where(eq(journeys.status, "active")).limit(1);
  const pillarRows = await tx
    .select()
    .from(pillars)
    .where(isNull(pillars.archivedAt))
    .orderBy(asc(pillars.sortOrder), asc(pillars.name));
  return {
    profile: profile ?? null,
    journey: journey ?? null,
    pillars: pillarRows,
    today: todayIn(profile?.timezone ?? "UTC"),
    weekStartsOn: profile?.weekStartsOn ?? 1,
    baseCurrency: profile?.baseCurrency ?? "USD",
  };
}
export type Workspace = Awaited<ReturnType<typeof getWorkspace>>;
export type ReadyWorkspace = Workspace & { journey: JourneyRow };

export async function requireWorkspace(tx: Tx): Promise<ReadyWorkspace> {
  const ws = await getWorkspace(tx);
  if (!ws.journey) throw new AppError(409, "journey_required", "Set up your five-year journey first.");
  return ws as ReadyWorkspace;
}

/** Creates the profile (if needed), the five-year journey and the default pillars. */
export async function createJourney(tx: Tx, input: JourneyCreateInput) {
  await tx
    .insert(profiles)
    .values({
      timezone: input.timezone,
      baseCurrency: input.baseCurrency,
      weekStartsOn: input.weekStartsOn,
      displayName: input.displayName,
    })
    .onConflictDoUpdate({
      target: profiles.id,
      set: {
        timezone: input.timezone,
        baseCurrency: input.baseCurrency,
        weekStartsOn: input.weekStartsOn,
        displayName: input.displayName,
      },
    });

  const [existing] = await tx.select({ id: journeys.id }).from(journeys).where(eq(journeys.status, "active")).limit(1);
  if (existing) throw new AppError(409, "journey_exists", "You already have an active five-year journey.");

  await tx.insert(journeys).values({
    name: input.name,
    startDate: input.startDate,
    endDate: addDays(addYears(input.startDate, 5), -1),
    status: "active",
  });
  await tx
    .insert(pillars)
    .values(DEFAULT_PILLARS.map((p) => ({ ...p })))
    .onConflictDoNothing({ target: [pillars.userId, pillars.key] });

  return requireWorkspace(tx);
}

// ---------------------------------------------------------------------------
// Vision (versioned narrative)
// ---------------------------------------------------------------------------

export async function getCurrentVision(tx: Tx, journeyId: string): Promise<VisionRow | null> {
  const [row] = await tx
    .select()
    .from(visions)
    .where(and(eq(visions.journeyId, journeyId), eq(visions.isCurrent, true)))
    .limit(1);
  return row ?? null;
}

export async function listVisionVersions(tx: Tx, journeyId: string): Promise<VisionRow[]> {
  return tx.select().from(visions).where(eq(visions.journeyId, journeyId)).orderBy(desc(visions.version));
}

/** Saving never overwrites: it adds version n+1 and makes it current. */
export async function saveVision(tx: Tx, input: VisionSaveInput): Promise<VisionRow> {
  const ws = await requireWorkspace(tx);
  const journeyId = ws.journey.id;
  const [{ maxVersion }] = await tx
    .select({ maxVersion: sql<number>`coalesce(max(${visions.version}), 0)::int` })
    .from(visions)
    .where(eq(visions.journeyId, journeyId));
  await tx
    .update(visions)
    .set({ isCurrent: false })
    .where(and(eq(visions.journeyId, journeyId), eq(visions.isCurrent, true)));
  const [row] = await tx
    .insert(visions)
    .values({ journeyId, version: maxVersion + 1, ...input, isCurrent: true, effectiveFrom: ws.today })
    .returning();
  return row;
}

// ---------------------------------------------------------------------------
// Goals: queries
// ---------------------------------------------------------------------------

async function findGoal(tx: Tx, id: string): Promise<GoalRow> {
  const [row] = await tx.select().from(goals).where(eq(goals.id, id)).limit(1);
  if (!row) throw notFound("Goal");
  return row;
}

export async function getGoal(tx: Tx, id: string): Promise<GoalView> {
  const goal = await findGoal(tx, id);
  const ws = await getWorkspace(tx);
  return decorateGoal(goal, ws.today);
}

export async function listGoals(tx: Tx, query: Partial<GoalListQuery>): Promise<GoalView[]> {
  const ws = await requireWorkspace(tx);
  const where: SQL[] = [eq(goals.journeyId, ws.journey.id)];
  if (!query.includeArchived) where.push(isNull(goals.archivedAt));
  if (query.level) where.push(eq(goals.level, query.level));
  if (query.pillarId) where.push(eq(goals.pillarId, query.pillarId));
  if (query.status) where.push(eq(goals.status, query.status));
  if (query.parentId === "root") where.push(isNull(goals.parentId));
  else if (query.parentId) where.push(eq(goals.parentId, query.parentId));
  if (query.q) where.push(ilike(goals.title, `%${query.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`));
  const rows = await tx
    .select()
    .from(goals)
    .where(and(...where))
    .orderBy(levelOrder, asc(goals.sortOrder), asc(goals.startDate), asc(goals.title));
  return rows.map((g) => decorateGoal(g, ws.today));
}

export type GoalTreeNode = TreeNode<GoalView & { blockedBy: number; childCount: number }>;

export async function getGoalTree(tx: Tx) {
  const ws = await requireWorkspace(tx);
  // Queries on one transaction run sequentially (a pg client serves one query at a time).
  const rows = await tx
    .select()
    .from(goals)
    .where(and(eq(goals.journeyId, ws.journey.id), isNull(goals.archivedAt)))
    .orderBy(levelOrder, asc(goals.sortOrder), asc(goals.startDate), asc(goals.title));
  const blockers = await tx
    .select({ goalId: goalDependencies.goalId, count: sql<number>`count(*)::int` })
    .from(goalDependencies)
    .innerJoin(goals, eq(goals.id, goalDependencies.dependsOnGoalId))
    .where(and(eq(goalDependencies.isBlocking, true), ne(goals.status, "achieved")))
    .groupBy(goalDependencies.goalId);
  const vision = await getCurrentVision(tx, ws.journey.id);
  const blockedBy = new Map(blockers.map((b) => [b.goalId, b.count]));
  const childCount = new Map<string, number>();
  for (const g of rows) if (g.parentId) childCount.set(g.parentId, (childCount.get(g.parentId) ?? 0) + 1);

  const tree = buildTree(
    rows.map((g) => ({
      ...decorateGoal(g, ws.today),
      blockedBy: blockedBy.get(g.id) ?? 0,
      childCount: childCount.get(g.id) ?? 0,
    })),
  ) as GoalTreeNode[];

  const byLevel = Object.fromEntries(
    (["five_year", "annual", "quarterly", "monthly", "weekly", "daily"] as GoalLevel[]).map((l) => [
      l,
      rows.filter((g) => g.level === l).length,
    ]),
  ) as Record<GoalLevel, number>;

  return { workspace: ws, vision, tree, total: rows.length, byLevel };
}

/** Compact list of goals for pickers (parent, dependency, related). */
export async function listGoalOptions(tx: Tx): Promise<GoalSummary[]> {
  const ws = await requireWorkspace(tx);
  return tx
    .select(summaryColumns)
    .from(goals)
    .where(and(eq(goals.journeyId, ws.journey.id), isNull(goals.archivedAt)))
    .orderBy(levelOrder, asc(goals.startDate), asc(goals.title));
}

export async function getGoalDetail(tx: Tx, id: string) {
  const ws = await requireWorkspace(tx);
  const goal = await findGoal(tx, id);

  type Ancestor = { id: string; title: string; level: GoalLevel; depth: number };
  const ancestors = goal.parentId
    ? await tx.execute<Ancestor>(sql`
        with recursive chain as (
          select id, parent_id, title, level, 0 as depth from goals where id = ${goal.parentId}
          union all
          select g.id, g.parent_id, g.title, g.level, chain.depth + 1
            from goals g join chain on g.id = chain.parent_id
        )
        select id, title, level, depth from chain order by depth desc`)
    : { rows: [] as Ancestor[] };

  const children = await tx
    .select()
    .from(goals)
    .where(and(eq(goals.parentId, id), isNull(goals.archivedAt)))
    .orderBy(levelOrder, asc(goals.startDate), asc(goals.title));
  const prerequisites = await tx
    .select({ isBlocking: goalDependencies.isBlocking, note: goalDependencies.note, goal: summaryColumns })
    .from(goalDependencies)
    .innerJoin(goals, eq(goals.id, goalDependencies.dependsOnGoalId))
    .where(eq(goalDependencies.goalId, id))
    .orderBy(asc(goals.title));
  const dependents = await tx
    .select({ isBlocking: goalDependencies.isBlocking, note: goalDependencies.note, goal: summaryColumns })
    .from(goalDependencies)
    .innerJoin(goals, eq(goals.id, goalDependencies.goalId))
    .where(eq(goalDependencies.dependsOnGoalId, id))
    .orderBy(asc(goals.title));
  const linksOut = await tx
    .select({ kind: goalLinks.kind, note: goalLinks.note, goal: summaryColumns })
    .from(goalLinks)
    .innerJoin(goals, eq(goals.id, goalLinks.relatedGoalId))
    .where(eq(goalLinks.goalId, id));
  const linksIn = await tx
    .select({ kind: goalLinks.kind, note: goalLinks.note, goal: summaryColumns })
    .from(goalLinks)
    .innerJoin(goals, eq(goals.id, goalLinks.goalId))
    .where(eq(goalLinks.relatedGoalId, id));
  const measurements = await tx
    .select()
    .from(goalMeasurements)
    .where(eq(goalMeasurements.goalId, id))
    .orderBy(desc(goalMeasurements.measuredOn), desc(goalMeasurements.createdAt));
  const taskRows = await tx
    .select()
    .from(tasks)
    .where(and(eq(tasks.goalId, id), isNull(tasks.archivedAt)))
    .orderBy(asc(tasks.status), asc(tasks.dueOn), asc(tasks.createdAt));

  const prereqForRules: Prerequisite[] = prerequisites.map((p) => ({
    goalId: p.goal.id,
    title: p.goal.title,
    status: p.goal.status as GoalStatus,
    isBlocking: p.isBlocking,
  }));

  return {
    workspace: ws,
    goal: decorateGoal(goal, ws.today),
    pillar: ws.pillars.find((p) => p.id === goal.pillarId) ?? null,
    ancestors: ancestors.rows,
    children: children.map((c) => decorateGoal(c, ws.today)),
    childSummary: summarizeChildren(children),
    prerequisites,
    dependents,
    links: [...linksOut, ...linksIn].sort((a, b) => a.goal.title.localeCompare(b.goal.title)),
    measurements,
    tasks: taskRows,
    taskSummary: summarizeTasks(taskRows),
    achievement: canMarkAchieved(goal, prereqForRules),
    blockers: prereqForRules.filter((p) => p.isBlocking && p.status !== "achieved"),
  };
}
export type GoalDetail = Awaited<ReturnType<typeof getGoalDetail>>;

// ---------------------------------------------------------------------------
// Goals: commands
// ---------------------------------------------------------------------------

export async function createGoal(tx: Tx, input: GoalCreateInput): Promise<GoalView> {
  const ws = await requireWorkspace(tx);
  let journeyId = ws.journey.id;
  let category = input.category;
  if (input.parentId) {
    const parent = await findGoal(tx, input.parentId);
    if (parent.archivedAt) throw new AppError(422, "parent_archived", "The parent goal is archived.");
    journeyId = parent.journeyId;
    category = category ?? parent.category;
  }
  const [row] = await tx
    .insert(goals)
    .values({
      ...input,
      category,
      journeyId,
      currency: input.unit === "currency" ? input.currency : null,
    })
    .returning();
  return decorateGoal(row, ws.today);
}

export async function updateGoal(tx: Tx, id: string, patch: GoalUpdateInput): Promise<GoalView> {
  const current = await findGoal(tx, id);
  const set: Partial<typeof goals.$inferInsert> = { ...patch };
  if (patch.parentId !== undefined && patch.parentId !== current.parentId && patch.parentId) {
    const parent = await findGoal(tx, patch.parentId);
    if (parent.archivedAt) throw new AppError(422, "parent_archived", "The parent goal is archived.");
    set.journeyId = parent.journeyId;
  }
  const unit = patch.unit ?? current.unit;
  if (unit !== "currency") set.currency = null;
  else if (patch.currency === undefined && current.currency) set.currency = current.currency;

  const [row] = await tx.update(goals).set(set).where(eq(goals.id, id)).returning();
  if (!row) throw notFound("Goal");
  const ws = await getWorkspace(tx);
  return decorateGoal(row, ws.today);
}

/** Archives the goal and all of its descendants (nothing is hard-deleted). */
export async function archiveGoal(tx: Tx, id: string): Promise<{ archived: number }> {
  await findGoal(tx, id);
  const result = await tx.execute(sql`
    with recursive subtree as (
      select id from goals where id = ${id}
      union all
      select g.id from goals g join subtree s on g.parent_id = s.id
    )
    update goals set archived_at = now()
     where id in (select id from subtree) and archived_at is null`);
  return { archived: result.rowCount ?? 0 };
}

export async function restoreGoal(tx: Tx, id: string): Promise<GoalView> {
  const goal = await findGoal(tx, id);
  if (goal.parentId) {
    const parent = await findGoal(tx, goal.parentId);
    if (parent.archivedAt) {
      throw new AppError(409, "parent_archived", "Restore the parent goal first.");
    }
  }
  await tx.execute(sql`
    with recursive subtree as (
      select id from goals where id = ${id}
      union all
      select g.id from goals g join subtree s on g.parent_id = s.id
    )
    update goals set archived_at = null where id in (select id from subtree)`);
  return getGoal(tx, id);
}

// ---------------------------------------------------------------------------
// Measurements (the only way progress changes)
// ---------------------------------------------------------------------------

export async function listMeasurements(tx: Tx, goalId: string): Promise<MeasurementRow[]> {
  await findGoal(tx, goalId);
  return tx
    .select()
    .from(goalMeasurements)
    .where(eq(goalMeasurements.goalId, goalId))
    .orderBy(desc(goalMeasurements.measuredOn), desc(goalMeasurements.createdAt));
}

export async function addMeasurement(tx: Tx, goalId: string, input: MeasurementCreateInput) {
  await findGoal(tx, goalId);
  const { today } = await getWorkspace(tx);
  if (input.measuredOn > today) {
    throw new AppError(
      422,
      "measurement_in_future",
      "Measurements record outcomes that have happened. Use today or an earlier date.",
      { measuredOn: ["Use today or an earlier date."] },
    );
  }
  const [measurement] = await tx
    .insert(goalMeasurements)
    .values({ goalId, ...input })
    .returning();
  return { measurement, goal: await getGoal(tx, goalId) };
}

export async function deleteMeasurement(tx: Tx, goalId: string, measurementId: string) {
  const deleted = await tx
    .delete(goalMeasurements)
    .where(and(eq(goalMeasurements.id, measurementId), eq(goalMeasurements.goalId, goalId)))
    .returning({ id: goalMeasurements.id });
  if (deleted.length === 0) throw notFound("Measurement");
  return { goal: await getGoal(tx, goalId) };
}

// ---------------------------------------------------------------------------
// Dependencies and related goals
// ---------------------------------------------------------------------------

export async function addDependency(tx: Tx, goalId: string, input: DependencyCreateInput) {
  if (goalId === input.dependsOnGoalId) throw new AppError(422, "dependency_self", "A goal cannot depend on itself.");
  await findGoal(tx, goalId);
  await findGoal(tx, input.dependsOnGoalId);
  const [row] = await tx
    .insert(goalDependencies)
    .values({ goalId, dependsOnGoalId: input.dependsOnGoalId, isBlocking: input.isBlocking, note: input.note })
    .returning();
  return row;
}

export async function removeDependency(tx: Tx, goalId: string, dependsOnGoalId: string) {
  const deleted = await tx
    .delete(goalDependencies)
    .where(and(eq(goalDependencies.goalId, goalId), eq(goalDependencies.dependsOnGoalId, dependsOnGoalId)))
    .returning({ goalId: goalDependencies.goalId });
  if (deleted.length === 0) throw notFound("Dependency");
}

function orderedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export async function addLink(tx: Tx, goalId: string, input: LinkCreateInput) {
  if (goalId === input.relatedGoalId) throw new AppError(422, "link_self", "A goal cannot be related to itself.");
  await findGoal(tx, goalId);
  await findGoal(tx, input.relatedGoalId);
  const [first, second] = orderedPair(goalId, input.relatedGoalId);
  const [row] = await tx
    .insert(goalLinks)
    .values({ goalId: first, relatedGoalId: second, kind: input.kind, note: input.note })
    .returning();
  return row;
}

export async function removeLink(tx: Tx, goalId: string, relatedGoalId: string) {
  const [first, second] = orderedPair(goalId, relatedGoalId);
  const deleted = await tx
    .delete(goalLinks)
    .where(and(eq(goalLinks.goalId, first), eq(goalLinks.relatedGoalId, second)))
    .returning({ goalId: goalLinks.goalId });
  if (deleted.length === 0) throw notFound("Related goal link");
}

// ---------------------------------------------------------------------------
// Tasks (activity only)
// ---------------------------------------------------------------------------

export async function listTasks(tx: Tx, filter: { goalId?: string }): Promise<TaskRow[]> {
  const where: SQL[] = [isNull(tasks.archivedAt)];
  if (filter.goalId) where.push(eq(tasks.goalId, filter.goalId));
  return tx
    .select()
    .from(tasks)
    .where(and(...where))
    .orderBy(asc(tasks.status), asc(tasks.dueOn), asc(tasks.createdAt));
}

export async function createTask(tx: Tx, input: TaskCreateInput): Promise<TaskRow> {
  if (input.goalId) await findGoal(tx, input.goalId);
  const [row] = await tx.insert(tasks).values(input).returning();
  return row;
}

export async function updateTask(tx: Tx, id: string, patch: TaskUpdateInput): Promise<TaskRow> {
  const [row] = await tx.update(tasks).set(patch).where(eq(tasks.id, id)).returning();
  if (!row) throw notFound("Task");
  return row;
}
