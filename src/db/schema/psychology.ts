/**
 * Sales psychology and human behaviour learning lab.
 */
import { sql } from "drizzle-orm";
import { check, date, foreignKey, index, integer, numeric, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { APPLICATION_OUTCOMES, EVIDENCE_LEVELS, PSYCH_CATEGORIES, REVIEW_RATINGS, SOURCE_TYPES, UNDERSTANDING_LEVELS } from "../../lib/domain/psychology";
import { inList, ownerColumn, pk, timestamps } from "./_columns";
import { users } from "./auth";

export const psychConcepts = pgTable(
  "psych_concepts",
  {
    id: pk(),
    userId: ownerColumn().references(() => users.id, { onDelete: "cascade" }),
    category: text("category", { enum: PSYCH_CATEGORIES }).notNull(),
    concept: text("concept").notNull(),
    explanation: text("explanation").notNull(),
    sourceTitle: text("source_title"),
    sourceAuthor: text("source_author"),
    sourceUrl: text("source_url"),
    sourceType: text("source_type", { enum: SOURCE_TYPES }).notNull().default("popular_book"),
    evidenceLevel: text("evidence_level", { enum: EVIDENCE_LEVELS }).notNull().default("practitioner"),
    evidenceNotes: text("evidence_notes"),
    example: text("example"),
    ethics: text("ethics"),
    whereToApply: text("where_to_apply"),
    observations: text("observations"),
    takeaways: text("takeaways"),
    understanding: text("understanding", { enum: UNDERSTANDING_LEVELS }).notNull().default("new"),
    learnedOn: date("learned_on", { mode: "string" }).notNull(),
    // Spaced repetition state
    srEase: numeric("sr_ease", { precision: 4, scale: 2, mode: "number" }).notNull().default(2.5),
    srIntervalDays: integer("sr_interval_days").notNull().default(0),
    srRepetitions: integer("sr_repetitions").notNull().default(0),
    srLapses: integer("sr_lapses").notNull().default(0),
    srDueOn: date("sr_due_on", { mode: "string" }).notNull(),
    lastReviewedOn: date("last_reviewed_on", { mode: "string" }),
    lastRating: text("last_rating", { enum: REVIEW_RATINGS }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    unique("psych_concepts_id_user_key").on(t.id, t.userId),
    check("psych_concepts_category_check", sql`${t.category} in (${inList(PSYCH_CATEGORIES)})`),
    check("psych_concepts_evidence_check", sql`${t.evidenceLevel} in (${inList(EVIDENCE_LEVELS)})`),
    check("psych_concepts_source_type_check", sql`${t.sourceType} in (${inList(SOURCE_TYPES)})`),
    check("psych_concepts_understanding_check", sql`${t.understanding} in (${inList(UNDERSTANDING_LEVELS)})`),
    check("psych_concepts_concept_check", sql`length(btrim(${t.concept})) between 1 and 200`),
    check("psych_concepts_explanation_check", sql`length(btrim(${t.explanation})) between 1 and 20000`),
    check("psych_concepts_url_check", sql`${t.sourceUrl} is null or ${t.sourceUrl} ~ '^https?://'`),
    check("psych_concepts_sr_check", sql`${t.srEase} >= 1.3 and ${t.srIntervalDays} >= 0 and ${t.srRepetitions} >= 0 and ${t.srLapses} >= 0`),
    index("psych_concepts_user_due_idx").on(t.userId, t.srDueOn),
  ],
);

export const psychReviews = pgTable(
  "psych_reviews",
  {
    id: pk(),
    userId: ownerColumn().references(() => users.id, { onDelete: "cascade" }),
    conceptId: uuid("concept_id").notNull(),
    reviewedOn: date("reviewed_on", { mode: "string" }).notNull(),
    rating: text("rating", { enum: REVIEW_RATINGS }).notNull(),
    intervalBefore: integer("interval_before").notNull(),
    intervalAfter: integer("interval_after").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ name: "psych_reviews_concept_fk", columns: [t.conceptId, t.userId], foreignColumns: [psychConcepts.id, psychConcepts.userId] }).onDelete("cascade"),
    check("psych_reviews_rating_check", sql`${t.rating} in (${inList(REVIEW_RATINGS)})`),
    index("psych_reviews_user_day_idx").on(t.userId, t.reviewedOn),
    index("psych_reviews_concept_idx").on(t.conceptId),
  ],
);

/** Real-world experiments: where a concept was applied and what happened. */
export const psychApplications = pgTable(
  "psych_applications",
  {
    id: pk(),
    userId: ownerColumn().references(() => users.id, { onDelete: "cascade" }),
    conceptId: uuid("concept_id").notNull(),
    appliedOn: date("applied_on", { mode: "string" }).notNull(),
    context: text("context").notNull(),
    action: text("action"),
    result: text("result"),
    outcome: text("outcome", { enum: APPLICATION_OUTCOMES }).notNull().default("inconclusive"),
    ...timestamps(),
  },
  (t) => [
    foreignKey({ name: "psych_applications_concept_fk", columns: [t.conceptId, t.userId], foreignColumns: [psychConcepts.id, psychConcepts.userId] }).onDelete("cascade"),
    check("psych_applications_outcome_check", sql`${t.outcome} in (${inList(APPLICATION_OUTCOMES)})`),
    check("psych_applications_context_check", sql`length(btrim(${t.context})) between 1 and 1000`),
    index("psych_applications_concept_idx").on(t.conceptId),
  ],
);
