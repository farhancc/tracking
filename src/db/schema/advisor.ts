/**
 * AI advisor: every question asked (with the verified answer and a log of the
 * data it read) and the changes it proposed, which wait for your confirmation.
 */
import { sql } from "drizzle-orm";
import { check, foreignKey, index, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { ownerColumn, pk } from "./_columns";
import { users } from "./auth";

export const advisorQuestions = pgTable(
  "advisor_questions",
  {
    id: pk(),
    userId: ownerColumn().references(() => users.id, { onDelete: "cascade" }),
    question: text("question").notNull(),
    /** The structured answer plus fact verification. */
    answer: jsonb("answer").$type<Record<string, unknown>>(),
    /** Which tools were called, with their inputs (audit trail). */
    toolLog: jsonb("tool_log").$type<{ name: string; input: unknown }[]>().notNull().default([]),
    model: text("model"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("advisor_questions_id_user_key").on(t.id, t.userId),
    check("advisor_questions_question_check", sql`length(btrim(${t.question})) between 1 and 2000`),
    index("advisor_questions_user_created_idx").on(t.userId, t.createdAt),
  ],
);

export const PROPOSAL_KINDS = ["update_goal", "archive_goal", "create_task", "delete_task"] as const;
export const PROPOSAL_STATUSES = ["pending", "confirmed", "rejected", "failed"] as const;

export const advisorProposals = pgTable(
  "advisor_proposals",
  {
    id: pk(),
    userId: ownerColumn().references(() => users.id, { onDelete: "cascade" }),
    questionId: uuid("question_id"),
    kind: text("kind", { enum: PROPOSAL_KINDS }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    summary: text("summary").notNull(),
    reason: text("reason").notNull(),
    status: text("status", { enum: PROPOSAL_STATUSES }).notNull().default("pending"),
    result: text("result"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ name: "advisor_proposals_question_fk", columns: [t.questionId, t.userId], foreignColumns: [advisorQuestions.id, advisorQuestions.userId] }).onDelete("cascade"),
    check("advisor_proposals_kind_check", sql`${t.kind} in ('update_goal', 'archive_goal', 'create_task', 'delete_task')`),
    check("advisor_proposals_status_check", sql`${t.status} in ('pending', 'confirmed', 'rejected', 'failed')`),
    check("advisor_proposals_decided_check", sql`(${t.status} = 'pending') = (${t.decidedAt} is null)`),
    index("advisor_proposals_user_status_idx").on(t.userId, t.status),
  ],
);
