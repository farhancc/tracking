/**
 * Knowledge and reading: resources, their concepts, practical applications
 * (linked to tasks and the sales journal), reading goals and a reading log.
 */
import { sql } from "drizzle-orm";
import { type AnyPgColumn, check, date, foreignKey, index, integer, pgTable, smallint, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { APPLICATION_STATUSES, RESOURCE_KINDS, RESOURCE_STATUSES } from "../../lib/domain/knowledge";
import { inList, ownerColumn, pk, timestamps } from "./_columns";
import { users } from "./auth";
import { goals } from "./goals";
import { psychConcepts } from "./psychology";
import { salesJournalEntries } from "./sales";
import { tasks } from "./tasks";

export const knowledgeResources = pgTable(
  "knowledge_resources",
  {
    id: pk(),
    userId: ownerColumn().references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: RESOURCE_KINDS }).notNull(),
    title: text("title").notNull(),
    author: text("author"),
    category: text("category"),
    url: text("url"),
    status: text("status", { enum: RESOURCE_STATUSES }).notNull().default("want"),
    startedOn: date("started_on", { mode: "string" }),
    completedOn: date("completed_on", { mode: "string" }),
    rating: smallint("rating"),
    notes: text("notes"),
    totalUnits: integer("total_units"),
    progressUnits: integer("progress_units"),
    goalId: uuid("goal_id"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    unique("knowledge_resources_id_user_key").on(t.id, t.userId),
    foreignKey({ name: "knowledge_resources_goal_fk", columns: [t.goalId, t.userId], foreignColumns: [goals.id, goals.userId] }).onDelete("restrict"),
    check("knowledge_resources_title_check", sql`length(btrim(${t.title})) between 1 and 300`),
    check("knowledge_resources_kind_check", sql`${t.kind} in (${inList(RESOURCE_KINDS)})`),
    check("knowledge_resources_status_check", sql`${t.status} in (${inList(RESOURCE_STATUSES)})`),
    check("knowledge_resources_completed_check", sql`(${t.status} = 'completed') = (${t.completedOn} is not null)`),
    check("knowledge_resources_started_check", sql`${t.status} = 'want' or ${t.startedOn} is not null`),
    check("knowledge_resources_dates_check", sql`${t.completedOn} is null or ${t.startedOn} is null or ${t.completedOn} >= ${t.startedOn}`),
    check("knowledge_resources_rating_check", sql`${t.rating} is null or ${t.rating} between 1 and 5`),
    check(
      "knowledge_resources_units_check",
      sql`(${t.totalUnits} is null or ${t.totalUnits} > 0) and (${t.progressUnits} is null or ${t.progressUnits} >= 0) and (${t.totalUnits} is null or ${t.progressUnits} is null or ${t.progressUnits} <= ${t.totalUnits})`,
    ),
    index("knowledge_resources_user_status_idx").on(t.userId, t.status),
  ],
);

const resourceFk = (name: string, t: { resourceId: AnyPgColumn; userId: AnyPgColumn }) =>
  foreignKey({ name, columns: [t.resourceId, t.userId], foreignColumns: [knowledgeResources.id, knowledgeResources.userId] }).onDelete("cascade");

export const knowledgeConcepts = pgTable(
  "knowledge_concepts",
  {
    id: pk(),
    userId: ownerColumn().references(() => users.id, { onDelete: "cascade" }),
    resourceId: uuid("resource_id").notNull(),
    concept: text("concept").notNull(),
    explanation: text("explanation"),
    /** Set when the concept was added to the sales psychology lab. */
    psychConceptId: uuid("psych_concept_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    resourceFk("knowledge_concepts_resource_fk", t),
    unique("knowledge_concepts_id_resource_key").on(t.id, t.resourceId),
    foreignKey({ name: "knowledge_concepts_psych_fk", columns: [t.psychConceptId, t.userId], foreignColumns: [psychConcepts.id, psychConcepts.userId] }).onDelete("restrict"),
    check("knowledge_concepts_concept_check", sql`length(btrim(${t.concept})) between 1 and 300`),
  ],
);

export const knowledgeApplications = pgTable(
  "knowledge_applications",
  {
    id: pk(),
    userId: ownerColumn().references(() => users.id, { onDelete: "cascade" }),
    resourceId: uuid("resource_id").notNull(),
    conceptId: uuid("concept_id"),
    description: text("description").notNull(),
    status: text("status", { enum: APPLICATION_STATUSES }).notNull().default("planned"),
    taskId: uuid("task_id"),
    journalEntryId: uuid("journal_entry_id"),
    result: text("result"),
    appliedOn: date("applied_on", { mode: "string" }),
    ...timestamps(),
  },
  (t) => [
    resourceFk("knowledge_applications_resource_fk", t),
    foreignKey({ name: "knowledge_applications_concept_fk", columns: [t.conceptId, t.resourceId], foreignColumns: [knowledgeConcepts.id, knowledgeConcepts.resourceId] }),
    foreignKey({ name: "knowledge_applications_task_fk", columns: [t.taskId, t.userId], foreignColumns: [tasks.id, tasks.userId] }).onDelete("restrict"),
    foreignKey({ name: "knowledge_applications_journal_fk", columns: [t.journalEntryId, t.userId], foreignColumns: [salesJournalEntries.id, salesJournalEntries.userId] }).onDelete("restrict"),
    check("knowledge_applications_description_check", sql`length(btrim(${t.description})) between 1 and 2000`),
    check("knowledge_applications_status_check", sql`${t.status} in (${inList(APPLICATION_STATUSES)})`),
    check("knowledge_applications_done_check", sql`${t.status} <> 'done' or ${t.appliedOn} is not null`),
    index("knowledge_applications_user_status_idx").on(t.userId, t.status),
  ],
);

export const readingGoals = pgTable(
  "reading_goals",
  {
    id: pk(),
    userId: ownerColumn().references(() => users.id, { onDelete: "cascade" }),
    year: smallint("year").notNull(),
    /** Resources to complete this year (counting the kinds below). */
    targetCount: integer("target_count"),
    kinds: text("kinds").array().notNull().default(sql`'{book}'::text[]`),
    dailyMinutes: integer("daily_minutes"),
    ...timestamps(),
  },
  (t) => [
    unique("reading_goals_user_year_key").on(t.userId, t.year),
    check("reading_goals_values_check", sql`(${t.targetCount} is null or ${t.targetCount} between 1 and 1000) and (${t.dailyMinutes} is null or ${t.dailyMinutes} between 1 and 1440)`),
    check("reading_goals_kinds_check", sql`cardinality(${t.kinds}) >= 1 and ${t.kinds} <@ array[${inList(RESOURCE_KINDS)}]::text[]`),
  ],
);

export const readingSessions = pgTable(
  "reading_sessions",
  {
    id: pk(),
    userId: ownerColumn().references(() => users.id, { onDelete: "cascade" }),
    resourceId: uuid("resource_id"),
    readOn: date("read_on", { mode: "string" }).notNull(),
    minutes: integer("minutes").notNull(),
    units: integer("units"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ name: "reading_sessions_resource_fk", columns: [t.resourceId, t.userId], foreignColumns: [knowledgeResources.id, knowledgeResources.userId] }).onDelete("restrict"),
    check("reading_sessions_minutes_check", sql`${t.minutes} between 1 and 1440`),
    check("reading_sessions_units_check", sql`${t.units} is null or ${t.units} >= 0`),
    index("reading_sessions_user_day_idx").on(t.userId, t.readOn),
  ],
);
