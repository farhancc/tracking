/**
 * Software product portfolio: products (separate from personal learning
 * goals), stage history, monthly customer metrics, a revenue/expense ledger,
 * milestones, releases, a feature backlog, customer feedback and bugs.
 */
import { sql } from "drizzle-orm";
import { type AnyPgColumn, char, check, date, foreignKey, index, integer, numeric, pgTable, smallint, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import {
  BUG_SEVERITIES,
  BUG_STATUSES,
  BUSINESS_MODELS,
  FEATURE_PRIORITIES,
  FEATURE_STATUSES,
  FEEDBACK_KINDS,
  FEEDBACK_SOURCES,
  MILESTONE_STATUSES,
  PRODUCT_STAGES,
  PRODUCT_STATUSES,
  SENTIMENTS,
  TRANSACTION_CATEGORIES,
  TRANSACTION_KINDS,
} from "../../lib/domain/products";
import { inList, ownerColumn, pk, timestamps } from "./_columns";
import { users } from "./auth";
import { goals } from "./goals";

const money = (name: string) => numeric(name, { precision: 20, scale: 2, mode: "number" });

export const products = pgTable(
  "products",
  {
    id: pk(),
    userId: ownerColumn().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    targetCustomer: text("target_customer"),
    problem: text("problem"),
    valueProposition: text("value_proposition"),
    businessModel: text("business_model", { enum: BUSINESS_MODELS }).notNull().default("subscription"),
    pricing: text("pricing"),
    stage: text("stage", { enum: PRODUCT_STAGES }).notNull().default("idea"),
    status: text("status", { enum: PRODUCT_STATUSES }).notNull().default("active"),
    currency: char("currency", { length: 3 }).notNull(),
    acquisitionChannels: text("acquisition_channels").array().notNull().default(sql`'{}'::text[]`),
    startedOn: date("started_on", { mode: "string" }).notNull(),
    stageEnteredOn: date("stage_entered_on", { mode: "string" }).notNull(),
    /** Forecast: when you intend to launch. */
    plannedLaunchOn: date("planned_launch_on", { mode: "string" }),
    /** Actual: when it went on sale. */
    launchedOn: date("launched_on", { mode: "string" }),
    goalId: uuid("goal_id"),
    statusNote: text("status_note"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    unique("products_id_user_key").on(t.id, t.userId),
    unique("products_user_name_key").on(t.userId, t.name),
    foreignKey({ name: "products_goal_fk", columns: [t.goalId, t.userId], foreignColumns: [goals.id, goals.userId] }).onDelete("restrict"),
    check("products_name_check", sql`length(btrim(${t.name})) between 1 and 120`),
    check("products_stage_check", sql`${t.stage} in (${inList(PRODUCT_STAGES)})`),
    check("products_status_check", sql`${t.status} in (${inList(PRODUCT_STATUSES)})`),
    check("products_business_model_check", sql`${t.businessModel} in (${inList(BUSINESS_MODELS)})`),
    check("products_currency_check", sql`${t.currency} ~ '^[A-Z]{3}$'`),
    check("products_launched_check", sql`${t.stage} not in ('launch', 'growth', 'optimization') or ${t.launchedOn} is not null`),
  ],
);

type OwnedChild = { productId: AnyPgColumn; userId: AnyPgColumn };
const productFk = (name: string, t: OwnedChild) =>
  foreignKey({ name, columns: [t.productId, t.userId], foreignColumns: [products.id, products.userId] }).onDelete("cascade");

export const productStageEvents = pgTable(
  "product_stage_events",
  {
    id: pk(),
    userId: ownerColumn().references(() => users.id, { onDelete: "cascade" }),
    productId: uuid("product_id").notNull(),
    fromStage: text("from_stage", { enum: PRODUCT_STAGES }),
    toStage: text("to_stage", { enum: PRODUCT_STAGES }).notNull(),
    changedOn: date("changed_on", { mode: "string" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [productFk("product_stage_events_product_fk", t), index("product_stage_events_product_idx").on(t.productId, t.createdAt)],
);

export const productMetrics = pgTable(
  "product_metrics",
  {
    id: pk(),
    userId: ownerColumn().references(() => users.id, { onDelete: "cascade" }),
    productId: uuid("product_id").notNull(),
    /** First day of the month the figures describe. */
    month: date("month", { mode: "string" }).notNull(),
    mrr: money("mrr"),
    activeCustomers: integer("active_customers").notNull(),
    newCustomers: integer("new_customers").notNull().default(0),
    churnedCustomers: integer("churned_customers").notNull().default(0),
    notes: text("notes"),
    ...timestamps(),
  },
  (t) => [
    productFk("product_metrics_product_fk", t),
    unique("product_metrics_product_month_key").on(t.productId, t.month),
    check("product_metrics_month_check", sql`extract(day from ${t.month}) = 1`),
    check("product_metrics_counts_check", sql`${t.activeCustomers} >= 0 and ${t.newCustomers} >= 0 and ${t.churnedCustomers} >= 0`),
    check("product_metrics_mrr_check", sql`${t.mrr} is null or ${t.mrr} >= 0`),
  ],
);

export const productTransactions = pgTable(
  "product_transactions",
  {
    id: pk(),
    userId: ownerColumn().references(() => users.id, { onDelete: "cascade" }),
    productId: uuid("product_id").notNull(),
    kind: text("kind", { enum: TRANSACTION_KINDS }).notNull(),
    category: text("category", { enum: TRANSACTION_CATEGORIES }).notNull(),
    amount: money("amount").notNull(),
    occurredOn: date("occurred_on", { mode: "string" }).notNull(),
    description: text("description"),
    ...timestamps(),
  },
  (t) => [
    productFk("product_transactions_product_fk", t),
    check("product_transactions_amount_check", sql`${t.amount} > 0`),
    check("product_transactions_kind_check", sql`${t.kind} in (${inList(TRANSACTION_KINDS)})`),
    check("product_transactions_category_check", sql`${t.category} in (${inList(TRANSACTION_CATEGORIES)})`),
    check(
      "product_transactions_kind_category_check",
      sql`(${t.kind} = 'revenue') = (${t.category} in ('subscription', 'one_time', 'services', 'refund', 'other_revenue'))`,
    ),
    index("product_transactions_product_date_idx").on(t.productId, t.occurredOn),
  ],
);

export const productMilestones = pgTable(
  "product_milestones",
  {
    id: pk(),
    userId: ownerColumn().references(() => users.id, { onDelete: "cascade" }),
    productId: uuid("product_id").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    stage: text("stage", { enum: PRODUCT_STAGES }),
    status: text("status", { enum: MILESTONE_STATUSES }).notNull().default("open"),
    dueOn: date("due_on", { mode: "string" }),
    completedOn: date("completed_on", { mode: "string" }),
    ...timestamps(),
  },
  (t) => [
    productFk("product_milestones_product_fk", t),
    check("product_milestones_title_check", sql`length(btrim(${t.title})) between 1 and 200`),
    check("product_milestones_status_check", sql`${t.status} in (${inList(MILESTONE_STATUSES)})`),
    check("product_milestones_done_check", sql`(${t.status} = 'done') = (${t.completedOn} is not null)`),
  ],
);

export const productReleases = pgTable(
  "product_releases",
  {
    id: pk(),
    userId: ownerColumn().references(() => users.id, { onDelete: "cascade" }),
    productId: uuid("product_id").notNull(),
    version: text("version").notNull(),
    title: text("title"),
    notes: text("notes"),
    plannedOn: date("planned_on", { mode: "string" }),
    releasedOn: date("released_on", { mode: "string" }),
    ...timestamps(),
  },
  (t) => [
    productFk("product_releases_product_fk", t),
    unique("product_releases_id_product_key").on(t.id, t.productId),
    unique("product_releases_product_version_key").on(t.productId, t.version),
    check("product_releases_version_check", sql`length(btrim(${t.version})) between 1 and 40`),
  ],
);

export const productFeatures = pgTable(
  "product_features",
  {
    id: pk(),
    userId: ownerColumn().references(() => users.id, { onDelete: "cascade" }),
    productId: uuid("product_id").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status", { enum: FEATURE_STATUSES }).notNull().default("backlog"),
    priority: text("priority", { enum: FEATURE_PRIORITIES }).notNull().default("should"),
    impact: smallint("impact"),
    effort: smallint("effort"),
    releaseId: uuid("release_id"),
    shippedOn: date("shipped_on", { mode: "string" }),
    ...timestamps(),
  },
  (t) => [
    productFk("product_features_product_fk", t),
    unique("product_features_id_product_key").on(t.id, t.productId),
    foreignKey({ name: "product_features_release_fk", columns: [t.releaseId, t.productId], foreignColumns: [productReleases.id, productReleases.productId] }),
    check("product_features_title_check", sql`length(btrim(${t.title})) between 1 and 200`),
    check("product_features_status_check", sql`${t.status} in (${inList(FEATURE_STATUSES)})`),
    check("product_features_priority_check", sql`${t.priority} in (${inList(FEATURE_PRIORITIES)})`),
    check("product_features_scores_check", sql`(${t.impact} is null or ${t.impact} between 1 and 5) and (${t.effort} is null or ${t.effort} between 1 and 5)`),
    check("product_features_shipped_check", sql`(${t.status} = 'shipped') = (${t.shippedOn} is not null)`),
  ],
);

export const productFeedback = pgTable(
  "product_feedback",
  {
    id: pk(),
    userId: ownerColumn().references(() => users.id, { onDelete: "cascade" }),
    productId: uuid("product_id").notNull(),
    receivedOn: date("received_on", { mode: "string" }).notNull(),
    customer: text("customer"),
    source: text("source", { enum: FEEDBACK_SOURCES }).notNull().default("other"),
    kind: text("kind", { enum: FEEDBACK_KINDS }).notNull(),
    sentiment: text("sentiment", { enum: SENTIMENTS }).notNull().default("neutral"),
    content: text("content").notNull(),
    featureId: uuid("feature_id"),
    ...timestamps(),
  },
  (t) => [
    productFk("product_feedback_product_fk", t),
    foreignKey({ name: "product_feedback_feature_fk", columns: [t.featureId, t.productId], foreignColumns: [productFeatures.id, productFeatures.productId] }),
    check("product_feedback_content_check", sql`length(btrim(${t.content})) between 1 and 5000`),
    check("product_feedback_kind_check", sql`${t.kind} in (${inList(FEEDBACK_KINDS)})`),
    check("product_feedback_source_check", sql`${t.source} in (${inList(FEEDBACK_SOURCES)})`),
    check("product_feedback_sentiment_check", sql`${t.sentiment} in (${inList(SENTIMENTS)})`),
    index("product_feedback_product_date_idx").on(t.productId, t.receivedOn),
  ],
);

export const productBugs = pgTable(
  "product_bugs",
  {
    id: pk(),
    userId: ownerColumn().references(() => users.id, { onDelete: "cascade" }),
    productId: uuid("product_id").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    severity: text("severity", { enum: BUG_SEVERITIES }).notNull().default("medium"),
    status: text("status", { enum: BUG_STATUSES }).notNull().default("open"),
    reportedOn: date("reported_on", { mode: "string" }).notNull(),
    fixedOn: date("fixed_on", { mode: "string" }),
    releaseId: uuid("release_id"),
    ...timestamps(),
  },
  (t) => [
    productFk("product_bugs_product_fk", t),
    foreignKey({ name: "product_bugs_release_fk", columns: [t.releaseId, t.productId], foreignColumns: [productReleases.id, productReleases.productId] }),
    check("product_bugs_title_check", sql`length(btrim(${t.title})) between 1 and 200`),
    check("product_bugs_severity_check", sql`${t.severity} in (${inList(BUG_SEVERITIES)})`),
    check("product_bugs_status_check", sql`${t.status} in (${inList(BUG_STATUSES)})`),
    check("product_bugs_fixed_check", sql`(${t.status} = 'fixed') = (${t.fixedOn} is not null)`),
    index("product_bugs_product_status_idx").on(t.productId, t.status),
  ],
);
