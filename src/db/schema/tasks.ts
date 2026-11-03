/**
 * Tasks are ACTIVITY. Linking a task to a goal lets the goal page show
 * "12 of 15 tasks done", but completing tasks never changes a goal's
 * current value, completion percentage or status. There is deliberately no
 * trigger from tasks to goals.
 *
 * This is the subset of the planned tasks table (docs/04 §4.3) needed by the
 * goal engine; the Tasks module (M1) adds the remaining columns.
 */
import { sql } from "drizzle-orm";
import { boolean, check, date, foreignKey, index, integer, jsonb, numeric, pgTable, smallint, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { TASK_STATUSES } from "../../lib/domain/goals";
import { inList, ownerColumn, pk, timestamps } from "./_columns";
import { users } from "./auth";
import { goals } from "./goals";

export const tasks = pgTable(
  "tasks",
  {
    id: pk(),
    userId: ownerColumn().references(() => users.id, { onDelete: "cascade" }),
    goalId: uuid("goal_id"),
    title: text("title").notNull(),
    notes: text("notes"),
    status: text("status", { enum: TASK_STATUSES }).notNull().default("todo"),
    dueOn: date("due_on", { mode: "string" }),
    priority: smallint("priority").notNull().default(3),
    estimatedMinutes: integer("estimated_minutes"),
    actualMinutes: integer("actual_minutes"),
    /** First day of the week this task is planned for (carry-forward moves it). */
    plannedWeek: date("planned_week", { mode: "string" }),
    /** A meaningful output, as opposed to routine activity. Only deliverables count towards the weekly score. */
    isDeliverable: boolean("is_deliverable").notNull().default(false),
    carryCount: smallint("carry_count").notNull().default(0),
    carriedFromWeek: date("carried_from_week", { mode: "string" }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    sortOrder: integer("sort_order").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    foreignKey({
      name: "tasks_goal_fk",
      columns: [t.goalId, t.userId],
      foreignColumns: [goals.id, goals.userId],
    }).onDelete("restrict"),
    check("tasks_status_check", sql`${t.status} in (${inList(TASK_STATUSES)})`),
    check("tasks_title_check", sql`length(btrim(${t.title})) between 1 and 300`),
    check("tasks_priority_check", sql`${t.priority} between 1 and 4`),
    check(
      "tasks_minutes_check",
      sql`(${t.estimatedMinutes} is null or ${t.estimatedMinutes} between 0 and 10000) and (${t.actualMinutes} is null or ${t.actualMinutes} between 0 and 10000)`,
    ),
    index("tasks_user_week_idx").on(t.userId, t.plannedWeek),
    index("tasks_goal_idx").on(t.goalId),
    index("tasks_user_due_idx").on(t.userId, t.dueOn),
  ],
);

/** One row per planned week: focus, available time, review and a frozen scorecard. */
export const weekPlans = pgTable(
  "week_plans",
  {
    id: pk(),
    userId: ownerColumn().references(() => users.id, { onDelete: "cascade" }),
    weekStart: date("week_start", { mode: "string" }).notNull(),
    focus: text("focus"),
    capacityHours: numeric("capacity_hours", { precision: 5, scale: 1, mode: "number" }),
    wins: text("wins"),
    lessons: text("lessons"),
    notes: text("notes"),
    /** Scorecard frozen at review time, so history never changes when data is edited later. */
    scorecard: jsonb("scorecard").$type<Record<string, unknown>>(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    unique("week_plans_user_week_key").on(t.userId, t.weekStart),
    check("week_plans_capacity_check", sql`${t.capacityHours} is null or ${t.capacityHours} between 0 and 120`),
  ],
);
