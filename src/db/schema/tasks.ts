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
import { check, date, foreignKey, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
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
    index("tasks_goal_idx").on(t.goalId),
    index("tasks_user_due_idx").on(t.userId, t.dueOn),
  ],
);
