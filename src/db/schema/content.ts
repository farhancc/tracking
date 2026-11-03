/**
 * Personal brand content: positioning, content pillars, content items moving
 * through the production pipeline, research sources and metric snapshots.
 */
import { sql } from "drizzle-orm";
import { type AnyPgColumn, check, date, foreignKey, index, integer, jsonb, numeric, pgTable, smallint, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { CONTENT_STATUSES, FORMATS, FORMATS_BY_PLATFORM, PLATFORMS } from "../../lib/domain/content";
import { inList, ownerColumn, pk, timestamps } from "./_columns";
import { users } from "./auth";

export const brandSettings = pgTable("brand_settings", {
  userId: uuid("user_id")
    .primaryKey()
    .default(sql`app.current_user_id()`)
    .references(() => users.id, { onDelete: "cascade" }),
  positioning: text("positioning").notNull(),
  audience: text("audience"),
  ...timestamps(),
});

export const contentPillars = pgTable(
  "content_pillars",
  {
    id: pk(),
    userId: ownerColumn().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    sortOrder: smallint("sort_order").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    unique("content_pillars_id_user_key").on(t.id, t.userId),
    unique("content_pillars_user_name_key").on(t.userId, t.name),
    check("content_pillars_name_check", sql`length(btrim(${t.name})) between 1 and 80`),
  ],
);

const formatCombos = sql.raw(
  Object.entries(FORMATS_BY_PLATFORM)
    .map(([p, fs]) => `(platform = '${p}' and format in (${fs.map((f) => `'${f}'`).join(", ")}))`)
    .join(" or "),
);

export const contentItems = pgTable(
  "content_items",
  {
    id: pk(),
    userId: ownerColumn().references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    topic: text("topic"),
    pillarId: uuid("pillar_id"),
    platform: text("platform", { enum: PLATFORMS }),
    format: text("format", { enum: FORMATS }),
    status: text("status", { enum: CONTENT_STATUSES }).notNull().default("idea"),
    hook: text("hook"),
    script: text("script"),
    notes: text("notes"),
    /** Forecasts */
    plannedRecordOn: date("planned_record_on", { mode: "string" }),
    scheduledOn: date("scheduled_on", { mode: "string" }),
    /** Actuals */
    recordedOn: date("recorded_on", { mode: "string" }),
    publishedOn: date("published_on", { mode: "string" }),
    publishedUrl: text("published_url"),
    reviewNotes: text("review_notes"),
    repurposedFromId: uuid("repurposed_from_id"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    unique("content_items_id_user_key").on(t.id, t.userId),
    foreignKey({ name: "content_items_pillar_fk", columns: [t.pillarId, t.userId], foreignColumns: [contentPillars.id, contentPillars.userId] }).onDelete("restrict"),
    foreignKey({ name: "content_items_repurposed_fk", columns: [t.repurposedFromId, t.userId], foreignColumns: [t.id, t.userId] }).onDelete("restrict"),
    check("content_items_title_check", sql`length(btrim(${t.title})) between 1 and 300`),
    check("content_items_status_check", sql`${t.status} in (${inList(CONTENT_STATUSES)})`),
    check("content_items_platform_check", sql`${t.platform} is null or ${t.platform} in (${inList(PLATFORMS)})`),
    check("content_items_platform_format_check", sql`(${t.platform} is null and ${t.format} is null) or (${formatCombos})`),
    check("content_items_platform_required_check", sql`${t.status} in ('idea', 'research') or ${t.platform} is not null`),
    check("content_items_scheduled_check", sql`${t.status} <> 'scheduled' or ${t.scheduledOn} is not null`),
    check("content_items_published_check", sql`(${t.status} in ('published', 'reviewed')) = (${t.publishedOn} is not null)`),
    check("content_items_reviewed_check", sql`${t.status} <> 'reviewed' or length(btrim(coalesce(${t.reviewNotes}, ''))) > 0`),
    check("content_items_not_own_source_check", sql`${t.repurposedFromId} is null or ${t.repurposedFromId} <> ${t.id}`),
    index("content_items_user_status_idx").on(t.userId, t.status),
    index("content_items_user_scheduled_idx").on(t.userId, t.scheduledOn),
    index("content_items_user_published_idx").on(t.userId, t.publishedOn),
  ],
);

const itemFk = (name: string, t: { itemId: AnyPgColumn; userId: AnyPgColumn }) =>
  foreignKey({ name, columns: [t.itemId, t.userId], foreignColumns: [contentItems.id, contentItems.userId] }).onDelete("cascade");

export const contentSources = pgTable(
  "content_sources",
  {
    id: pk(),
    userId: ownerColumn().references(() => users.id, { onDelete: "cascade" }),
    itemId: uuid("item_id").notNull(),
    title: text("title").notNull(),
    url: text("url"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [itemFk("content_sources_item_fk", t), check("content_sources_title_check", sql`length(btrim(${t.title})) between 1 and 300`)],
);

const count = (name: string) => integer(name);
export const contentMetrics = pgTable(
  "content_metrics",
  {
    id: pk(),
    userId: ownerColumn().references(() => users.id, { onDelete: "cascade" }),
    itemId: uuid("item_id").notNull(),
    capturedOn: date("captured_on", { mode: "string" }).notNull(),
    views: count("views"),
    reach: count("reach"),
    impressions: count("impressions"),
    likes: count("likes"),
    comments: count("comments"),
    shares: count("shares"),
    saves: count("saves"),
    watchTimeMinutes: numeric("watch_time_minutes", { precision: 14, scale: 1, mode: "number" }),
    avgViewSeconds: numeric("avg_view_seconds", { precision: 10, scale: 1, mode: "number" }),
    avgRetentionPct: numeric("avg_retention_pct", { precision: 5, scale: 2, mode: "number" }),
    completionRatePct: numeric("completion_rate_pct", { precision: 5, scale: 2, mode: "number" }),
    profileVisits: count("profile_visits"),
    followersGained: count("followers_gained"),
    websiteClicks: count("website_clicks"),
    leads: count("leads"),
    salesCount: count("sales_count"),
    salesAmount: numeric("sales_amount", { precision: 20, scale: 2, mode: "number" }),
    /** Platform-specific extras (PLATFORM_EXTRA_METRICS), numbers only. */
    platformMetrics: jsonb("platform_metrics").$type<Record<string, number>>().notNull().default({}),
    notes: text("notes"),
    ...timestamps(),
  },
  (t) => [
    itemFk("content_metrics_item_fk", t),
    unique("content_metrics_item_date_key").on(t.itemId, t.capturedOn),
    check(
      "content_metrics_nonnegative_check",
      sql`coalesce(${t.views}, 0) >= 0 and coalesce(${t.reach}, 0) >= 0 and coalesce(${t.impressions}, 0) >= 0 and coalesce(${t.likes}, 0) >= 0
        and coalesce(${t.comments}, 0) >= 0 and coalesce(${t.shares}, 0) >= 0 and coalesce(${t.saves}, 0) >= 0 and coalesce(${t.watchTimeMinutes}, 0) >= 0
        and coalesce(${t.avgViewSeconds}, 0) >= 0 and coalesce(${t.profileVisits}, 0) >= 0 and coalesce(${t.websiteClicks}, 0) >= 0
        and coalesce(${t.leads}, 0) >= 0 and coalesce(${t.salesCount}, 0) >= 0 and coalesce(${t.salesAmount}, 0) >= 0`,
    ),
    check(
      "content_metrics_pct_check",
      sql`(${t.avgRetentionPct} is null or ${t.avgRetentionPct} between 0 and 100) and (${t.completionRatePct} is null or ${t.completionRatePct} between 0 and 100)`,
    ),
    index("content_metrics_user_date_idx").on(t.userId, t.capturedOn),
  ],
);

/** Follower / subscriber counts per platform over time: audience growth, one signal among many. */
export const audienceSnapshots = pgTable(
  "audience_snapshots",
  {
    id: pk(),
    userId: ownerColumn().references(() => users.id, { onDelete: "cascade" }),
    platform: text("platform", { enum: PLATFORMS }).notNull(),
    capturedOn: date("captured_on", { mode: "string" }).notNull(),
    followers: integer("followers").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("audience_snapshots_user_platform_date_key").on(t.userId, t.platform, t.capturedOn),
    check("audience_snapshots_platform_check", sql`${t.platform} in (${inList(PLATFORMS)})`),
    check("audience_snapshots_followers_check", sql`${t.followers} >= 0`),
  ],
);
