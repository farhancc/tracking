/**
 * Five-year strategic goal engine.
 *
 *   five_year (vision) → annual → quarterly → monthly → weekly → daily (actions)
 *
 * Every goal is measured by an OUTCOME: a success metric moving from
 * baseline_value to target_value. current_value is DERIVED from
 * goal_measurements by trigger and cannot be written by the application.
 * Tasks and child goals never change a goal's progress or status.
 *
 * Cross-row rules (hierarchy, dependency cycles, "achieved requires outcome")
 * live in drizzle/0002_goal_engine_rules.sql.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  char,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import {
  GOAL_CATEGORIES,
  GOAL_LEVELS,
  GOAL_STATUSES,
  LINK_KINDS,
  MEASURE_UNITS,
  MEASUREMENT_MODES,
  MEASUREMENT_SOURCES,
} from "../../lib/domain/goals";
import { inList, ownerColumn, pk, timestamps } from "./_columns";
import { users } from "./auth";
import { journeys, pillars } from "./core";

const value = (name: string) => numeric(name, { precision: 20, scale: 4, mode: "number" });

export const goals = pgTable(
  "goals",
  {
    id: pk(),
    userId: ownerColumn().references(() => users.id, { onDelete: "cascade" }),
    journeyId: uuid("journey_id").notNull(),
    parentId: uuid("parent_id"),
    level: text("level", { enum: GOAL_LEVELS }).notNull(),
    category: text("category", { enum: GOAL_CATEGORIES }),
    pillarId: uuid("pillar_id").notNull(),
    /** A key result measures its parent objective (same level allowed). */
    isKeyResult: boolean("is_key_result").notNull().default(false),

    title: text("title").notNull(),
    description: text("description"),
    startDate: date("start_date", { mode: "string" }).notNull(),
    targetDate: date("target_date", { mode: "string" }).notNull(),
    priority: smallint("priority").notNull().default(3),
    status: text("status", { enum: GOAL_STATUSES }).notNull().default("not_started"),

    // Outcome definition
    successMetric: text("success_metric").notNull(),
    unit: text("unit", { enum: MEASURE_UNITS }).notNull().default("number"),
    currency: char("currency", { length: 3 }),
    measurementMode: text("measurement_mode", { enum: MEASUREMENT_MODES }).notNull().default("latest"),
    baselineValue: value("baseline_value").notNull().default(0),
    targetValue: value("target_value").notNull(),

    // Derived by trigger from goal_measurements. Never written by the app.
    currentValue: value("current_value").notNull().default(0),
    currentValueAsOf: date("current_value_as_of", { mode: "string" }),
    completionPct: numeric("completion_pct", { precision: 5, scale: 1, mode: "number" })
      .notNull()
      .generatedAlwaysAs(
        sql`case
          when target_value = baseline_value then case when current_value = target_value then 100 else 0 end
          else round(least(100, greatest(0, (current_value - baseline_value) / (target_value - baseline_value) * 100)), 1)
        end`,
      ),
    isTargetMet: boolean("is_target_met")
      .notNull()
      .generatedAlwaysAs(
        sql`case when target_value >= baseline_value then current_value >= target_value else current_value <= target_value end`,
      ),

    notes: text("notes"),
    /** Planned effort, used by roadmap capacity checks. */
    estimatedHours: numeric("estimated_hours", { precision: 8, scale: 1, mode: "number" }),
    sortOrder: integer("sort_order").notNull().default(0),
    customFields: jsonb("custom_fields").$type<Record<string, unknown>>().notNull().default({}),
    achievedAt: timestamp("achieved_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    unique("goals_id_user_key").on(t.id, t.userId),
    foreignKey({
      name: "goals_journey_fk",
      columns: [t.journeyId, t.userId],
      foreignColumns: [journeys.id, journeys.userId],
    }).onDelete("cascade"),
    foreignKey({
      name: "goals_pillar_fk",
      columns: [t.pillarId, t.userId],
      foreignColumns: [pillars.id, pillars.userId],
    }).onDelete("restrict"),
    foreignKey({
      name: "goals_parent_fk",
      columns: [t.parentId, t.userId],
      foreignColumns: [t.id, t.userId],
    }).onDelete("restrict"),

    check("goals_level_check", sql`${t.level} in (${inList(GOAL_LEVELS)})`),
    check("goals_category_check", sql`${t.category} is null or ${t.category} in (${inList(GOAL_CATEGORIES)})`),
    check("goals_status_check", sql`${t.status} in (${inList(GOAL_STATUSES)})`),
    check("goals_unit_check", sql`${t.unit} in (${inList(MEASURE_UNITS)})`),
    check("goals_measurement_mode_check", sql`${t.measurementMode} in (${inList(MEASUREMENT_MODES)})`),
    check("goals_priority_check", sql`${t.priority} between 1 and 4`),
    check("goals_title_check", sql`length(btrim(${t.title})) between 1 and 200`),
    check("goals_success_metric_check", sql`length(btrim(${t.successMetric})) between 1 and 200`),
    check("goals_dates_check", sql`${t.targetDate} >= ${t.startDate}`),
    check("goals_not_own_parent_check", sql`${t.parentId} is null or ${t.parentId} <> ${t.id}`),
    check("goals_five_year_root_check", sql`${t.level} <> 'five_year' or (${t.parentId} is null and ${t.category} is not null)`),
    check(
      "goals_currency_check",
      sql`(${t.unit} = 'currency') = (${t.currency} is not null) and (${t.currency} is null or ${t.currency} ~ '^[A-Z]{3}$')`,
    ),
    check(
      "goals_boolean_values_check",
      sql`${t.unit} <> 'boolean' or (${t.baselineValue} in (0, 1) and ${t.targetValue} in (0, 1) and ${t.measurementMode} = 'latest')`,
    ),
    check(
      "goals_key_results_scale_check",
      sql`${t.measurementMode} <> 'key_results' or (${t.unit} = 'percent' and ${t.baselineValue} = 0 and ${t.targetValue} = 100)`,
    ),
    check(
      "goals_key_result_shape_check",
      sql`not ${t.isKeyResult} or (${t.parentId} is not null and ${t.measurementMode} <> 'key_results')`,
    ),
    check("goals_estimated_hours_check", sql`${t.estimatedHours} is null or ${t.estimatedHours} >= 0`),

    index("goals_user_journey_level_idx").on(t.userId, t.journeyId, t.level),
    index("goals_parent_idx").on(t.parentId),
    index("goals_pillar_idx").on(t.pillarId),
  ],
);

/** Outcome check-ins. The only way a goal's current value changes. */
export const goalMeasurements = pgTable(
  "goal_measurements",
  {
    id: pk(),
    userId: ownerColumn().references(() => users.id, { onDelete: "cascade" }),
    goalId: uuid("goal_id").notNull(),
    measuredOn: date("measured_on", { mode: "string" }).notNull(),
    value: value("value").notNull(),
    note: text("note"),
    source: text("source", { enum: MEASUREMENT_SOURCES }).notNull().default("manual"),
    ...timestamps(),
  },
  (t) => [
    foreignKey({
      name: "goal_measurements_goal_fk",
      columns: [t.goalId, t.userId],
      foreignColumns: [goals.id, goals.userId],
    }).onDelete("cascade"),
    check("goal_measurements_source_check", sql`${t.source} in (${inList(MEASUREMENT_SOURCES)})`),
    index("goal_measurements_goal_measured_idx").on(t.goalId, t.measuredOn),
  ],
);

/**
 * goal_id depends on depends_on_goal_id. A blocking dependency prevents
 * goal_id from being marked achieved until the prerequisite is achieved.
 * Cycles are rejected by trigger.
 */
export const goalDependencies = pgTable(
  "goal_dependencies",
  {
    userId: ownerColumn().references(() => users.id, { onDelete: "cascade" }),
    goalId: uuid("goal_id").notNull(),
    dependsOnGoalId: uuid("depends_on_goal_id").notNull(),
    isBlocking: boolean("is_blocking").notNull().default(true),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: "goal_dependencies_pkey", columns: [t.goalId, t.dependsOnGoalId] }),
    foreignKey({
      name: "goal_dependencies_goal_fk",
      columns: [t.goalId, t.userId],
      foreignColumns: [goals.id, goals.userId],
    }).onDelete("cascade"),
    foreignKey({
      name: "goal_dependencies_depends_on_fk",
      columns: [t.dependsOnGoalId, t.userId],
      foreignColumns: [goals.id, goals.userId],
    }).onDelete("cascade"),
    check("goal_dependencies_not_self_check", sql`${t.goalId} <> ${t.dependsOnGoalId}`),
    index("goal_dependencies_depends_on_idx").on(t.dependsOnGoalId),
  ],
);

/** Symmetric "related goals". Stored once per pair with goal_id < related_goal_id. */
export const goalLinks = pgTable(
  "goal_links",
  {
    userId: ownerColumn().references(() => users.id, { onDelete: "cascade" }),
    goalId: uuid("goal_id").notNull(),
    relatedGoalId: uuid("related_goal_id").notNull(),
    kind: text("kind", { enum: LINK_KINDS }).notNull().default("related"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: "goal_links_pkey", columns: [t.goalId, t.relatedGoalId] }),
    foreignKey({
      name: "goal_links_goal_fk",
      columns: [t.goalId, t.userId],
      foreignColumns: [goals.id, goals.userId],
    }).onDelete("cascade"),
    foreignKey({
      name: "goal_links_related_fk",
      columns: [t.relatedGoalId, t.userId],
      foreignColumns: [goals.id, goals.userId],
    }).onDelete("cascade"),
    check("goal_links_canonical_order_check", sql`${t.goalId} < ${t.relatedGoalId}`),
    check("goal_links_kind_check", sql`${t.kind} in (${inList(LINK_KINDS)})`),
    index("goal_links_related_idx").on(t.relatedGoalId),
  ],
);
