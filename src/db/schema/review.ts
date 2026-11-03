/**
 * Weekly reviews: your answers to the twelve questions, and the report,
 * observations and patterns frozen when the review is completed.
 */
import { date, jsonb, pgTable, timestamp, unique } from "drizzle-orm/pg-core";
import type { ReviewAnswers } from "../../lib/domain/review";
import { ownerColumn, pk, timestamps } from "./_columns";
import { users } from "./auth";

export const weekReviews = pgTable(
  "week_reviews",
  {
    id: pk(),
    userId: ownerColumn().references(() => users.id, { onDelete: "cascade" }),
    weekStart: date("week_start", { mode: "string" }).notNull(),
    answers: jsonb("answers").$type<ReviewAnswers>().notNull(),
    /** Frozen at completion so history doesn't change when data is edited later. */
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [unique("week_reviews_user_week_key").on(t.userId, t.weekStart)],
);
