import { sql } from "drizzle-orm";
import {
  boolean,
  char,
  check,
  date,
  foreignKey,
  integer,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { inList, ownerColumn, pk, timestamps } from "./_columns";
import { users } from "./auth";

export const profiles = pgTable(
  "profiles",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`app.current_user_id()`)
      .references(() => users.id, { onDelete: "cascade" }),
    displayName: text("display_name"),
    timezone: text("timezone").notNull().default("UTC"),
    baseCurrency: char("base_currency", { length: 3 }).notNull().default("USD"),
    weekStartsOn: smallint("week_starts_on").notNull().default(1),
    /** Hours per week available for the plan; quarters copy it and can override. */
    weeklyCapacityHours: numeric("weekly_capacity_hours", { precision: 5, scale: 1, mode: "number" }).notNull().default(15),
    ...timestamps(),
  },
  (t) => [
    check("profiles_week_starts_on_check", sql`${t.weekStartsOn} between 0 and 6`),
    check("profiles_weekly_capacity_check", sql`${t.weeklyCapacityHours} between 0 and 120`),
    check("profiles_base_currency_check", sql`${t.baseCurrency} ~ '^[A-Z]{3}$'`),
  ],
);

export const JOURNEY_STATUSES = ["planned", "active", "completed"] as const;

/** A five-year horizon. A second five-year plan is a new row. */
export const journeys = pgTable(
  "journeys",
  {
    id: pk(),
    userId: ownerColumn().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }).notNull(),
    status: text("status", { enum: JOURNEY_STATUSES }).notNull().default("active"),
    ...timestamps(),
  },
  (t) => [
    unique("journeys_id_user_key").on(t.id, t.userId),
    uniqueIndex("journeys_one_active_per_user").on(t.userId).where(sql`${t.status} = 'active'`),
    check("journeys_dates_check", sql`${t.endDate} > ${t.startDate}`),
    check("journeys_status_check", sql`${t.status} in (${inList(JOURNEY_STATUSES)})`),
  ],
);

/** Strategic pillars. Seeded with four; user-editable (add a fifth without a migration). */
export const pillars = pgTable(
  "pillars",
  {
    id: pk(),
    userId: ownerColumn().references(() => users.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    color: text("color").notNull().default("#64748b"),
    weight: numeric("weight", { precision: 5, scale: 2, mode: "number" }).notNull().default(1),
    sortOrder: integer("sort_order").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    unique("pillars_id_user_key").on(t.id, t.userId),
    unique("pillars_user_key_key").on(t.userId, t.key),
    check("pillars_key_check", sql`${t.key} ~ '^[a-z][a-z0-9_]{1,31}$'`),
    check("pillars_color_check", sql`${t.color} ~ '^#[0-9a-fA-F]{6}$'`),
  ],
);

/**
 * The narrative five-year vision. Versioned: saving creates a new version and
 * marks it current, so the history of how the vision evolved is kept.
 * Measurable parts of the vision (financial target, business ownership,
 * skills, brand, exit conditions) are five_year-level goals.
 */
export const visions = pgTable(
  "visions",
  {
    id: pk(),
    userId: ownerColumn().references(() => users.id, { onDelete: "cascade" }),
    journeyId: uuid("journey_id").notNull(),
    version: integer("version").notNull(),
    title: text("title").notNull().default("Five-year vision"),
    statement: text("statement").notNull(),
    professionalIdentity: text("professional_identity"),
    exitStrategy: text("exit_strategy"),
    isCurrent: boolean("is_current").notNull().default(true),
    effectiveFrom: date("effective_from", { mode: "string" }).notNull().default(sql`current_date`),
    ...timestamps(),
  },
  (t) => [
    foreignKey({
      name: "visions_journey_fk",
      columns: [t.journeyId, t.userId],
      foreignColumns: [journeys.id, journeys.userId],
    }).onDelete("cascade"),
    unique("visions_journey_version_key").on(t.journeyId, t.version),
    uniqueIndex("visions_one_current_per_journey").on(t.journeyId).where(sql`${t.isCurrent}`),
    check("visions_version_check", sql`${t.version} >= 1`),
    check("visions_statement_check", sql`length(btrim(${t.statement})) > 0`),
  ],
);
