/**
 * Communication mastery: skills, exercises, resources, practice sessions,
 * audio recordings and assessments. Proficiency comes only from assessments.
 */
import { sql } from "drizzle-orm";
import { boolean, check, date, foreignKey, index, integer, pgTable, smallint, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { ASSESSMENT_METHODS, RESOURCE_KINDS } from "../../lib/domain/communication";
import { inList, ownerColumn, pk, timestamps } from "./_columns";
import { users } from "./auth";

export const commSkills = pgTable(
  "comm_skills",
  {
    id: pk(),
    userId: ownerColumn().references(() => users.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    targetLevel: smallint("target_level").notNull().default(8),
    sortOrder: integer("sort_order").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    unique("comm_skills_id_user_key").on(t.id, t.userId),
    unique("comm_skills_user_key_key").on(t.userId, t.key),
    check("comm_skills_target_check", sql`${t.targetLevel} between 1 and 10`),
    check("comm_skills_name_check", sql`length(btrim(${t.name})) between 1 and 120`),
  ],
);

export const commExercises = pgTable(
  "comm_exercises",
  {
    id: pk(),
    userId: ownerColumn().references(() => users.id, { onDelete: "cascade" }),
    skillId: uuid("skill_id"),
    key: text("key"),
    title: text("title").notNull(),
    instructions: text("instructions"),
    durationMinutes: integer("duration_minutes"),
    isDaily: boolean("is_daily").notNull().default(false),
    wantsRecording: boolean("wants_recording").notNull().default(false),
    wantsWords: boolean("wants_words").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    unique("comm_exercises_id_user_key").on(t.id, t.userId),
    unique("comm_exercises_user_key_key").on(t.userId, t.key),
    foreignKey({ name: "comm_exercises_skill_fk", columns: [t.skillId, t.userId], foreignColumns: [commSkills.id, commSkills.userId] }).onDelete("restrict"),
    check("comm_exercises_title_check", sql`length(btrim(${t.title})) between 1 and 200`),
  ],
);

export const commResources = pgTable(
  "comm_resources",
  {
    id: pk(),
    userId: ownerColumn().references(() => users.id, { onDelete: "cascade" }),
    skillId: uuid("skill_id").notNull(),
    kind: text("kind", { enum: RESOURCE_KINDS }).notNull().default("other"),
    title: text("title").notNull(),
    url: text("url"),
    notes: text("notes"),
    ...timestamps(),
  },
  (t) => [
    foreignKey({ name: "comm_resources_skill_fk", columns: [t.skillId, t.userId], foreignColumns: [commSkills.id, commSkills.userId] }).onDelete("cascade"),
    check("comm_resources_kind_check", sql`${t.kind} in (${inList(RESOURCE_KINDS)})`),
    check("comm_resources_url_check", sql`${t.url} is null or ${t.url} ~ '^https?://'`),
  ],
);

export const commRecordings = pgTable(
  "comm_recordings",
  {
    id: pk(),
    userId: ownerColumn().references(() => users.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    durationSeconds: integer("duration_seconds"),
    ...timestamps(),
  },
  (t) => [
    unique("comm_recordings_id_user_key").on(t.id, t.userId),
    unique("comm_recordings_storage_key").on(t.storageKey),
    check("comm_recordings_size_check", sql`${t.sizeBytes} between 1 and 5242880`),
    check("comm_recordings_mime_check", sql`${t.mimeType} like 'audio/%'`),
  ],
);

export const commPracticeSessions = pgTable(
  "comm_practice_sessions",
  {
    id: pk(),
    userId: ownerColumn().references(() => users.id, { onDelete: "cascade" }),
    skillId: uuid("skill_id"),
    exerciseId: uuid("exercise_id"),
    practicedOn: date("practiced_on", { mode: "string" }).notNull(),
    durationMinutes: integer("duration_minutes"),
    /** How the session went (1–5). Not a proficiency rating. */
    selfRating: smallint("self_rating"),
    notes: text("notes"),
    /** Written output: explanation, summary, objection response. */
    content: text("content"),
    words: text("words").array().notNull().default(sql`'{}'::text[]`),
    recordingId: uuid("recording_id"),
    ...timestamps(),
  },
  (t) => [
    foreignKey({ name: "comm_sessions_skill_fk", columns: [t.skillId, t.userId], foreignColumns: [commSkills.id, commSkills.userId] }).onDelete("restrict"),
    foreignKey({ name: "comm_sessions_exercise_fk", columns: [t.exerciseId, t.userId], foreignColumns: [commExercises.id, commExercises.userId] }).onDelete("restrict"),
    foreignKey({ name: "comm_sessions_recording_fk", columns: [t.recordingId, t.userId], foreignColumns: [commRecordings.id, commRecordings.userId] }).onDelete("restrict"),
    check("comm_sessions_rating_check", sql`${t.selfRating} is null or ${t.selfRating} between 1 and 5`),
    check("comm_sessions_duration_check", sql`${t.durationMinutes} is null or ${t.durationMinutes} between 0 and 600`),
    check("comm_sessions_target_check", sql`${t.skillId} is not null or ${t.exerciseId} is not null`),
    index("comm_sessions_user_day_idx").on(t.userId, t.practicedOn),
    index("comm_sessions_skill_idx").on(t.skillId),
  ],
);

export const commAssessments = pgTable(
  "comm_assessments",
  {
    id: pk(),
    userId: ownerColumn().references(() => users.id, { onDelete: "cascade" }),
    skillId: uuid("skill_id").notNull(),
    assessedOn: date("assessed_on", { mode: "string" }).notNull(),
    level: smallint("level").notNull(),
    method: text("method", { enum: ASSESSMENT_METHODS }).notNull().default("self"),
    assessor: text("assessor"),
    /** What the rating is based on: observed behaviour, scores, feedback. */
    evidence: text("evidence").notNull(),
    recordingId: uuid("recording_id"),
    notes: text("notes"),
    ...timestamps(),
  },
  (t) => [
    foreignKey({ name: "comm_assessments_skill_fk", columns: [t.skillId, t.userId], foreignColumns: [commSkills.id, commSkills.userId] }).onDelete("cascade"),
    foreignKey({ name: "comm_assessments_recording_fk", columns: [t.recordingId, t.userId], foreignColumns: [commRecordings.id, commRecordings.userId] }).onDelete("restrict"),
    check("comm_assessments_level_check", sql`${t.level} between 1 and 10`),
    check("comm_assessments_method_check", sql`${t.method} in (${inList(ASSESSMENT_METHODS)})`),
    check("comm_assessments_evidence_check", sql`length(btrim(${t.evidence})) between 3 and 5000`),
    index("comm_assessments_skill_day_idx").on(t.skillId, t.assessedOn),
  ],
);
