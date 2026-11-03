/**
 * Sales mastery: tracks (separate sales contexts with their own currency and
 * targets), prospects, an activity log, deals, targets and a learning journal.
 */
import { sql } from "drizzle-orm";
import { boolean, char, check, date, foreignKey, index, integer, numeric, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import {
  ACTIVITY_KINDS,
  CHANNELS,
  DEAL_STAGES,
  JOURNAL_KINDS,
  PROSPECT_STATUSES,
  SALES_METRICS,
  SALES_PERIODS,
} from "../../lib/domain/sales";
import { inList, ownerColumn, pk, timestamps } from "./_columns";
import { users } from "./auth";
import { contentItems } from "./content";

const money = (name: string) => numeric(name, { precision: 20, scale: 2, mode: "number" });

export const salesTracks = pgTable(
  "sales_tracks",
  {
    id: pk(),
    userId: ownerColumn().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    currency: char("currency", { length: 3 }).notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    unique("sales_tracks_id_user_key").on(t.id, t.userId),
    unique("sales_tracks_user_name_key").on(t.userId, t.name),
    uniqueIndex("sales_tracks_one_default").on(t.userId).where(sql`${t.isDefault}`),
    check("sales_tracks_currency_check", sql`${t.currency} ~ '^[A-Z]{3}$'`),
    check("sales_tracks_name_check", sql`length(btrim(${t.name})) between 1 and 120`),
  ],
);

export const prospects = pgTable(
  "prospects",
  {
    id: pk(),
    userId: ownerColumn().references(() => users.id, { onDelete: "cascade" }),
    trackId: uuid("track_id").notNull(),
    name: text("name").notNull(),
    company: text("company"),
    role: text("role"),
    email: text("email"),
    phone: text("phone"),
    source: text("source"),
    status: text("status", { enum: PROSPECT_STATUSES }).notNull().default("new"),
    nextFollowUpOn: date("next_follow_up_on", { mode: "string" }),
    notes: text("notes"),
    /** The piece of content this lead came from (attribution for content analytics). */
    contentItemId: uuid("content_item_id"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    unique("prospects_id_user_key").on(t.id, t.userId),
    foreignKey({ name: "prospects_content_item_fk", columns: [t.contentItemId, t.userId], foreignColumns: [contentItems.id, contentItems.userId] }).onDelete("restrict"),
    index("prospects_user_content_idx").on(t.userId, t.contentItemId),
    foreignKey({ name: "prospects_track_fk", columns: [t.trackId, t.userId], foreignColumns: [salesTracks.id, salesTracks.userId] }).onDelete("restrict"),
    check("prospects_status_check", sql`${t.status} in (${inList(PROSPECT_STATUSES)})`),
    check("prospects_name_check", sql`length(btrim(${t.name})) between 1 and 200`),
    index("prospects_user_follow_up_idx").on(t.userId, t.nextFollowUpOn),
  ],
);

export const deals = pgTable(
  "deals",
  {
    id: pk(),
    userId: ownerColumn().references(() => users.id, { onDelete: "cascade" }),
    trackId: uuid("track_id").notNull(),
    prospectId: uuid("prospect_id"),
    title: text("title").notNull(),
    stage: text("stage", { enum: DEAL_STAGES }).notNull().default("qualified"),
    amount: money("amount"),
    currency: char("currency", { length: 3 }).notNull(),
    quotedOn: date("quoted_on", { mode: "string" }),
    expectedCloseOn: date("expected_close_on", { mode: "string" }),
    closedOn: date("closed_on", { mode: "string" }),
    lostReason: text("lost_reason"),
    notes: text("notes"),
    ...timestamps(),
  },
  (t) => [
    unique("deals_id_user_key").on(t.id, t.userId),
    foreignKey({ name: "deals_track_fk", columns: [t.trackId, t.userId], foreignColumns: [salesTracks.id, salesTracks.userId] }).onDelete("restrict"),
    foreignKey({ name: "deals_prospect_fk", columns: [t.prospectId, t.userId], foreignColumns: [prospects.id, prospects.userId] }).onDelete("restrict"),
    check("deals_stage_check", sql`${t.stage} in (${inList(DEAL_STAGES)})`),
    check("deals_closed_check", sql`(${t.stage} in ('won', 'lost')) = (${t.closedOn} is not null)`),
    check("deals_won_amount_check", sql`${t.stage} <> 'won' or (${t.amount} is not null and ${t.amount} > 0)`),
    check("deals_amount_check", sql`${t.amount} is null or ${t.amount} >= 0`),
    check("deals_currency_check", sql`${t.currency} ~ '^[A-Z]{3}$'`),
    check("deals_title_check", sql`length(btrim(${t.title})) between 1 and 200`),
    index("deals_user_closed_idx").on(t.userId, t.closedOn),
  ],
);

export const salesActivities = pgTable(
  "sales_activities",
  {
    id: pk(),
    userId: ownerColumn().references(() => users.id, { onDelete: "cascade" }),
    trackId: uuid("track_id").notNull(),
    prospectId: uuid("prospect_id"),
    dealId: uuid("deal_id"),
    kind: text("kind", { enum: ACTIVITY_KINDS }).notNull(),
    channel: text("channel", { enum: CHANNELS }).notNull().default("phone"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    occurredOn: date("occurred_on", { mode: "string" }).notNull(),
    /** For calls: picked up. For emails/messages and follow-ups: got a response. */
    connected: boolean("connected").notNull().default(false),
    reachedDecisionMaker: boolean("reached_decision_maker").notNull().default(false),
    qualified: boolean("qualified").notNull().default(false),
    meetingBooked: boolean("meeting_booked").notNull().default(false),
    amount: money("amount"),
    currency: char("currency", { length: 3 }),
    durationMinutes: integer("duration_minutes"),
    notes: text("notes"),
    ...timestamps(),
  },
  (t) => [
    foreignKey({ name: "sales_activities_track_fk", columns: [t.trackId, t.userId], foreignColumns: [salesTracks.id, salesTracks.userId] }).onDelete("restrict"),
    foreignKey({ name: "sales_activities_prospect_fk", columns: [t.prospectId, t.userId], foreignColumns: [prospects.id, prospects.userId] }).onDelete("restrict"),
    foreignKey({ name: "sales_activities_deal_fk", columns: [t.dealId, t.userId], foreignColumns: [deals.id, deals.userId] }).onDelete("restrict"),
    check("sales_activities_kind_check", sql`${t.kind} in (${inList(ACTIVITY_KINDS)})`),
    check("sales_activities_channel_check", sql`${t.channel} in (${inList(CHANNELS)})`),
    // Outcomes form a ladder: reaching a decision-maker, qualifying or booking a meeting all require a connection.
    check(
      "sales_activities_outcome_ladder_check",
      sql`(not ${t.reachedDecisionMaker} or ${t.connected}) and (not ${t.qualified} or ${t.connected}) and (not ${t.meetingBooked} or ${t.connected})`,
    ),
    check("sales_activities_amount_check", sql`(${t.amount} is null) = (${t.currency} is null) and (${t.amount} is null or (${t.kind} = 'quotation' and ${t.amount} >= 0))`),
    check("sales_activities_duration_check", sql`${t.durationMinutes} is null or ${t.durationMinutes} between 0 and 1440`),
    index("sales_activities_user_day_idx").on(t.userId, t.occurredOn),
    index("sales_activities_track_day_idx").on(t.trackId, t.occurredOn),
  ],
);

export const salesTargets = pgTable(
  "sales_targets",
  {
    id: pk(),
    userId: ownerColumn().references(() => users.id, { onDelete: "cascade" }),
    trackId: uuid("track_id").notNull(),
    metric: text("metric", { enum: SALES_METRICS }).notNull(),
    period: text("period", { enum: SALES_PERIODS }).notNull(),
    targetValue: numeric("target_value", { precision: 20, scale: 2, mode: "number" }).notNull(),
    effectiveFrom: date("effective_from", { mode: "string" }).notNull(),
    ...timestamps(),
  },
  (t) => [
    foreignKey({ name: "sales_targets_track_fk", columns: [t.trackId, t.userId], foreignColumns: [salesTracks.id, salesTracks.userId] }).onDelete("cascade"),
    unique("sales_targets_unique_key").on(t.trackId, t.metric, t.period, t.effectiveFrom),
    check("sales_targets_metric_check", sql`${t.metric} in (${inList(SALES_METRICS)})`),
    check("sales_targets_period_check", sql`${t.period} in (${inList(SALES_PERIODS)})`),
    check("sales_targets_value_check", sql`${t.targetValue} >= 0`),
  ],
);

export const salesJournalEntries = pgTable(
  "sales_journal_entries",
  {
    id: pk(),
    userId: ownerColumn().references(() => users.id, { onDelete: "cascade" }),
    trackId: uuid("track_id"),
    prospectId: uuid("prospect_id"),
    kind: text("kind", { enum: JOURNAL_KINDS }).notNull(),
    occurredOn: date("occurred_on", { mode: "string" }).notNull(),
    title: text("title").notNull(),
    /** What the prospect said (objection, rejection reason, key moment). */
    situation: text("situation"),
    /** What I said or did. */
    response: text("response"),
    /** For responses: did it work? */
    worked: boolean("worked"),
    lesson: text("lesson"),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    ...timestamps(),
  },
  (t) => [
    foreignKey({ name: "sales_journal_track_fk", columns: [t.trackId, t.userId], foreignColumns: [salesTracks.id, salesTracks.userId] }).onDelete("restrict"),
    foreignKey({ name: "sales_journal_prospect_fk", columns: [t.prospectId, t.userId], foreignColumns: [prospects.id, prospects.userId] }).onDelete("restrict"),
    check("sales_journal_kind_check", sql`${t.kind} in (${inList(JOURNAL_KINDS)})`),
    check("sales_journal_title_check", sql`length(btrim(${t.title})) between 1 and 200`),
    index("sales_journal_user_day_idx").on(t.userId, t.occurredOn),
  ],
);
