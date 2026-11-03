/**
 * Annual and quarterly roadmap: 5 annual plans and 20 quarterly cycles per
 * journey. Objectives and key results are goals (see goals.ts): annual
 * objectives are annual-level goals and quarterly objectives are
 * quarterly-level goals whose period starts inside the quarter. These tables
 * add the planning artefacts around them.
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
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { MEASURE_UNITS } from "../../lib/domain/goals";
import { DELIVERABLE_STATUSES, DEPENDENCY_STATUSES, KPI_DIRECTIONS, RISK_STATUSES } from "../../lib/domain/roadmap";
import { inList, ownerColumn, pk, timestamps } from "./_columns";
import { users } from "./auth";
import { journeys } from "./core";
import { goals } from "./goals";

export const roadmapYears = pgTable(
  "roadmap_years",
  {
    id: pk(),
    userId: ownerColumn().references(() => users.id, { onDelete: "cascade" }),
    journeyId: uuid("journey_id").notNull(),
    yearNumber: smallint("year_number").notNull(),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }).notNull(),
    theme: text("theme").notNull(),
    direction: text("direction").notNull(),
    /** Provisional until the owner confirms it; directions are not guaranteed outcomes. */
    isProvisional: boolean("is_provisional").notNull().default(true),
    notes: text("notes"),
    ...timestamps(),
  },
  (t) => [
    unique("roadmap_years_id_user_key").on(t.id, t.userId),
    unique("roadmap_years_journey_year_key").on(t.journeyId, t.yearNumber),
    foreignKey({ name: "roadmap_years_journey_fk", columns: [t.journeyId, t.userId], foreignColumns: [journeys.id, journeys.userId] }).onDelete("cascade"),
    check("roadmap_years_number_check", sql`${t.yearNumber} between 1 and 5`),
    check("roadmap_years_dates_check", sql`${t.endDate} > ${t.startDate}`),
  ],
);

export const roadmapQuarters = pgTable(
  "roadmap_quarters",
  {
    id: pk(),
    userId: ownerColumn().references(() => users.id, { onDelete: "cascade" }),
    journeyId: uuid("journey_id").notNull(),
    yearNumber: smallint("year_number").notNull(),
    quarterNumber: smallint("quarter_number").notNull(), // 1…20 across the journey
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }).notNull(),
    focus: text("focus"),
    capacityHoursPerWeek: numeric("capacity_hours_per_week", { precision: 5, scale: 1, mode: "number" }),
    midReviewOn: date("mid_review_on", { mode: "string" }),
    reviewOn: date("review_on", { mode: "string" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewSummary: text("review_summary"),
    ...timestamps(),
  },
  (t) => [
    unique("roadmap_quarters_id_user_key").on(t.id, t.userId),
    unique("roadmap_quarters_journey_quarter_key").on(t.journeyId, t.quarterNumber),
    foreignKey({ name: "roadmap_quarters_journey_fk", columns: [t.journeyId, t.userId], foreignColumns: [journeys.id, journeys.userId] }).onDelete("cascade"),
    check("roadmap_quarters_number_check", sql`${t.quarterNumber} between 1 and 20 and ${t.yearNumber} between 1 and 5`),
    check("roadmap_quarters_dates_check", sql`${t.endDate} > ${t.startDate}`),
    check("roadmap_quarters_capacity_check", sql`${t.capacityHoursPerWeek} is null or ${t.capacityHoursPerWeek} between 0 and 120`),
    check(
      "roadmap_quarters_review_dates_check",
      sql`(${t.midReviewOn} is null or ${t.midReviewOn} between ${t.startDate} and ${t.endDate}) and (${t.reviewOn} is null or ${t.reviewOn} >= ${t.startDate})`,
    ),
  ],
);

export const quarterDeliverables = pgTable(
  "quarter_deliverables",
  {
    id: pk(),
    userId: ownerColumn().references(() => users.id, { onDelete: "cascade" }),
    quarterId: uuid("quarter_id").notNull(),
    goalId: uuid("goal_id"),
    title: text("title").notNull(),
    dueOn: date("due_on", { mode: "string" }),
    estimatedHours: numeric("estimated_hours", { precision: 8, scale: 1, mode: "number" }),
    status: text("status", { enum: DELIVERABLE_STATUSES }).notNull().default("planned"),
    deliveredOn: date("delivered_on", { mode: "string" }),
    evidence: text("evidence"),
    notes: text("notes"),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps(),
  },
  (t) => [
    foreignKey({ name: "quarter_deliverables_quarter_fk", columns: [t.quarterId, t.userId], foreignColumns: [roadmapQuarters.id, roadmapQuarters.userId] }).onDelete("cascade"),
    foreignKey({ name: "quarter_deliverables_goal_fk", columns: [t.goalId, t.userId], foreignColumns: [goals.id, goals.userId] }).onDelete("restrict"),
    check("quarter_deliverables_status_check", sql`${t.status} in (${inList(DELIVERABLE_STATUSES)})`),
    check("quarter_deliverables_title_check", sql`length(btrim(${t.title})) between 1 and 300`),
    check("quarter_deliverables_delivered_check", sql`(${t.status} = 'delivered') = (${t.deliveredOn} is not null)`),
    check("quarter_deliverables_hours_check", sql`${t.estimatedHours} is null or ${t.estimatedHours} >= 0`),
    index("quarter_deliverables_quarter_idx").on(t.quarterId),
    index("quarter_deliverables_goal_idx").on(t.goalId),
  ],
);

export const quarterKpis = pgTable(
  "quarter_kpis",
  {
    id: pk(),
    userId: ownerColumn().references(() => users.id, { onDelete: "cascade" }),
    quarterId: uuid("quarter_id").notNull(),
    name: text("name").notNull(),
    unit: text("unit", { enum: MEASURE_UNITS }).notNull().default("number"),
    currency: char("currency", { length: 3 }),
    direction: text("direction", { enum: KPI_DIRECTIONS }).notNull().default("up"),
    targetValue: numeric("target_value", { precision: 20, scale: 4, mode: "number" }).notNull(),
    actualValue: numeric("actual_value", { precision: 20, scale: 4, mode: "number" }),
    notes: text("notes"),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps(),
  },
  (t) => [
    foreignKey({ name: "quarter_kpis_quarter_fk", columns: [t.quarterId, t.userId], foreignColumns: [roadmapQuarters.id, roadmapQuarters.userId] }).onDelete("cascade"),
    check("quarter_kpis_unit_check", sql`${t.unit} in (${inList(MEASURE_UNITS)})`),
    check("quarter_kpis_direction_check", sql`${t.direction} in (${inList(KPI_DIRECTIONS)})`),
    check("quarter_kpis_name_check", sql`length(btrim(${t.name})) between 1 and 200`),
    check("quarter_kpis_currency_check", sql`(${t.unit} = 'currency') = (${t.currency} is not null)`),
    index("quarter_kpis_quarter_idx").on(t.quarterId),
  ],
);

export const quarterRisks = pgTable(
  "quarter_risks",
  {
    id: pk(),
    userId: ownerColumn().references(() => users.id, { onDelete: "cascade" }),
    quarterId: uuid("quarter_id").notNull(),
    title: text("title").notNull(),
    likelihood: smallint("likelihood").notNull().default(3),
    impact: smallint("impact").notNull().default(3),
    score: smallint("score").notNull().generatedAlwaysAs(sql`likelihood * impact`),
    mitigation: text("mitigation"),
    status: text("status", { enum: RISK_STATUSES }).notNull().default("open"),
    notes: text("notes"),
    ...timestamps(),
  },
  (t) => [
    foreignKey({ name: "quarter_risks_quarter_fk", columns: [t.quarterId, t.userId], foreignColumns: [roadmapQuarters.id, roadmapQuarters.userId] }).onDelete("cascade"),
    check("quarter_risks_scale_check", sql`${t.likelihood} between 1 and 5 and ${t.impact} between 1 and 5`),
    check("quarter_risks_status_check", sql`${t.status} in (${inList(RISK_STATUSES)})`),
    check("quarter_risks_title_check", sql`length(btrim(${t.title})) between 1 and 300`),
    index("quarter_risks_quarter_idx").on(t.quarterId),
  ],
);

/** External or cross-goal dependencies for the quarter (goal-to-goal ones live in goal_dependencies). */
export const quarterDependencies = pgTable(
  "quarter_dependencies",
  {
    id: pk(),
    userId: ownerColumn().references(() => users.id, { onDelete: "cascade" }),
    quarterId: uuid("quarter_id").notNull(),
    description: text("description").notNull(),
    dependsOnGoalId: uuid("depends_on_goal_id"),
    neededBy: date("needed_by", { mode: "string" }),
    status: text("status", { enum: DEPENDENCY_STATUSES }).notNull().default("open"),
    notes: text("notes"),
    ...timestamps(),
  },
  (t) => [
    foreignKey({ name: "quarter_dependencies_quarter_fk", columns: [t.quarterId, t.userId], foreignColumns: [roadmapQuarters.id, roadmapQuarters.userId] }).onDelete("cascade"),
    foreignKey({ name: "quarter_dependencies_goal_fk", columns: [t.dependsOnGoalId, t.userId], foreignColumns: [goals.id, goals.userId] }).onDelete("restrict"),
    check("quarter_dependencies_status_check", sql`${t.status} in (${inList(DEPENDENCY_STATUSES)})`),
    check("quarter_dependencies_description_check", sql`length(btrim(${t.description})) between 1 and 500`),
    index("quarter_dependencies_quarter_idx").on(t.quarterId),
  ],
);
