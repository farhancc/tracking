/**
 * Daily execution: one plan per day (available time and reflection), and
 * habits with daily check-ins. The habit model here is the minimum the Today
 * screen needs; the habit module (Prompt 14) extends it.
 */
import { sql } from "drizzle-orm";
import { check, date, foreignKey, index, integer, pgTable, smallint, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { ownerColumn, pk, timestamps } from "./_columns";
import { users } from "./auth";
import { pillars } from "./core";

export const dayPlans = pgTable(
  "day_plans",
  {
    id: pk(),
    userId: ownerColumn().references(() => users.id, { onDelete: "cascade" }),
    day: date("day", { mode: "string" }).notNull(),
    availableMinutes: integer("available_minutes"),
    accomplished: text("accomplished"),
    learned: text("learned"),
    wentWrong: text("went_wrong"),
    improveTomorrow: text("improve_tomorrow"),
    reflectedAt: timestamp("reflected_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    unique("day_plans_user_day_key").on(t.userId, t.day),
    check("day_plans_available_check", sql`${t.availableMinutes} is null or ${t.availableMinutes} between 0 and 1440`),
  ],
);

export const habits = pgTable(
  "habits",
  {
    id: pk(),
    userId: ownerColumn().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    pillarId: uuid("pillar_id"),
    /** Days of the week it is scheduled (0 = Sunday … 6 = Saturday). */
    scheduleDays: smallint("schedule_days").array().notNull().default(sql`'{0,1,2,3,4,5,6}'::smallint[]`),
    sortOrder: integer("sort_order").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    unique("habits_id_user_key").on(t.id, t.userId),
    foreignKey({ name: "habits_pillar_fk", columns: [t.pillarId, t.userId], foreignColumns: [pillars.id, pillars.userId] }).onDelete("restrict"),
    check("habits_name_check", sql`length(btrim(${t.name})) between 1 and 120`),
    check(
      "habits_schedule_check",
      sql`cardinality(${t.scheduleDays}) between 1 and 7 and ${t.scheduleDays} <@ '{0,1,2,3,4,5,6}'::smallint[]`,
    ),
  ],
);

export const HABIT_CHECKIN_STATUSES = ["done", "skipped"] as const;

export const habitCheckins = pgTable(
  "habit_checkins",
  {
    id: pk(),
    userId: ownerColumn().references(() => users.id, { onDelete: "cascade" }),
    habitId: uuid("habit_id").notNull(),
    checkinOn: date("checkin_on", { mode: "string" }).notNull(),
    status: text("status", { enum: HABIT_CHECKIN_STATUSES }).notNull().default("done"),
    note: text("note"),
    ...timestamps(),
  },
  (t) => [
    unique("habit_checkins_habit_day_key").on(t.habitId, t.checkinOn),
    foreignKey({ name: "habit_checkins_habit_fk", columns: [t.habitId, t.userId], foreignColumns: [habits.id, habits.userId] }).onDelete("cascade"),
    check("habit_checkins_status_check", sql`${t.status} in ('done', 'skipped')`),
    index("habit_checkins_user_day_idx").on(t.userId, t.checkinOn),
  ],
);
