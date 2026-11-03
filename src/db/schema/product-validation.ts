/**
 * Product validation: 12 steps per product with evidence, a customer
 * interview log and competitor research.
 */
import { sql } from "drizzle-orm";
import { type AnyPgColumn, boolean, check, date, foreignKey, index, numeric, pgTable, smallint, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { EVIDENCE_KINDS, STEP_STATUSES, VALIDATION_STEPS, WILLINGNESS } from "../../lib/domain/product-validation";
import { inList, ownerColumn, pk, timestamps } from "./_columns";
import { users } from "./auth";
import { products } from "./products";

const productFk = (name: string, t: { productId: AnyPgColumn; userId: AnyPgColumn }) =>
  foreignKey({ name, columns: [t.productId, t.userId], foreignColumns: [products.id, products.userId] }).onDelete("cascade");

export const productValidationSteps = pgTable(
  "product_validation_steps",
  {
    id: pk(),
    userId: ownerColumn().references(() => users.id, { onDelete: "cascade" }),
    productId: uuid("product_id").notNull(),
    step: text("step", { enum: VALIDATION_STEPS }).notNull(),
    status: text("status", { enum: STEP_STATUSES }).notNull().default("not_started"),
    successCriteria: text("success_criteria").notNull(),
    notes: text("notes"),
    decidedOn: date("decided_on", { mode: "string" }),
    ...timestamps(),
  },
  (t) => [
    productFk("product_validation_steps_product_fk", t),
    unique("product_validation_steps_product_step_key").on(t.productId, t.step),
    check("product_validation_steps_step_check", sql`${t.step} in (${inList(VALIDATION_STEPS)})`),
    check("product_validation_steps_status_check", sql`${t.status} in (${inList(STEP_STATUSES)})`),
    check("product_validation_steps_decided_check", sql`(${t.status} in ('validated', 'invalidated')) = (${t.decidedOn} is not null)`),
    check("product_validation_steps_criteria_check", sql`length(btrim(${t.successCriteria})) between 1 and 2000`),
  ],
);

export const productValidationEvidence = pgTable(
  "product_validation_evidence",
  {
    id: pk(),
    userId: ownerColumn().references(() => users.id, { onDelete: "cascade" }),
    productId: uuid("product_id").notNull(),
    step: text("step", { enum: VALIDATION_STEPS }).notNull(),
    kind: text("kind", { enum: EVIDENCE_KINDS }).notNull(),
    observedOn: date("observed_on", { mode: "string" }).notNull(),
    summary: text("summary").notNull(),
    value: numeric("value", { precision: 20, scale: 2, mode: "number" }),
    url: text("url"),
    ...timestamps(),
  },
  (t) => [
    productFk("product_validation_evidence_product_fk", t),
    foreignKey({
      name: "product_validation_evidence_step_fk",
      columns: [t.productId, t.step],
      foreignColumns: [productValidationSteps.productId, productValidationSteps.step],
    }).onDelete("cascade"),
    check("product_validation_evidence_kind_check", sql`${t.kind} in (${inList(EVIDENCE_KINDS)})`),
    check("product_validation_evidence_summary_check", sql`length(btrim(${t.summary})) between 1 and 5000`),
    check("product_validation_evidence_value_check", sql`${t.kind} not in ('metric', 'visitors', 'signups', 'payment') or ${t.value} is not null`),
    check("product_validation_evidence_count_check", sql`${t.kind} not in ('visitors', 'signups', 'payment') or ${t.value} >= 0`),
    index("product_validation_evidence_product_step_idx").on(t.productId, t.step),
  ],
);

export const productInterviews = pgTable(
  "product_interviews",
  {
    id: pk(),
    userId: ownerColumn().references(() => users.id, { onDelete: "cascade" }),
    productId: uuid("product_id").notNull(),
    interviewedOn: date("interviewed_on", { mode: "string" }).notNull(),
    customerName: text("customer_name"),
    customerType: text("customer_type").notNull(),
    problem: text("problem"),
    /** Did they confirm the problem (ideally unprompted)? null = not asked. */
    confirmsProblem: boolean("confirms_problem"),
    painLevel: smallint("pain_level"),
    currentSolution: text("current_solution"),
    willingness: text("willingness", { enum: WILLINGNESS }).notNull().default("unclear"),
    statedPrice: numeric("stated_price", { precision: 20, scale: 2, mode: "number" }),
    objections: text("objections"),
    feedback: text("feedback"),
    followUpOn: date("follow_up_on", { mode: "string" }),
    followUpDone: boolean("follow_up_done").notNull().default(false),
    ...timestamps(),
  },
  (t) => [
    productFk("product_interviews_product_fk", t),
    check("product_interviews_type_check", sql`length(btrim(${t.customerType})) between 1 and 200`),
    check("product_interviews_willingness_check", sql`${t.willingness} in (${inList(WILLINGNESS)})`),
    check("product_interviews_pain_check", sql`${t.painLevel} is null or ${t.painLevel} between 1 and 5`),
    check("product_interviews_price_check", sql`${t.statedPrice} is null or ${t.statedPrice} >= 0`),
    index("product_interviews_product_date_idx").on(t.productId, t.interviewedOn),
    index("product_interviews_user_follow_up_idx").on(t.userId, t.followUpOn).where(sql`not ${t.followUpDone}`),
  ],
);

export const productCompetitors = pgTable(
  "product_competitors",
  {
    id: pk(),
    userId: ownerColumn().references(() => users.id, { onDelete: "cascade" }),
    productId: uuid("product_id").notNull(),
    name: text("name").notNull(),
    url: text("url"),
    pricing: text("pricing"),
    strengths: text("strengths"),
    weaknesses: text("weaknesses"),
    whyCustomersWouldSwitch: text("why_switch"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    productFk("product_competitors_product_fk", t),
    unique("product_competitors_product_name_key").on(t.productId, t.name),
    check("product_competitors_name_check", sql`length(btrim(${t.name})) between 1 and 200`),
  ],
);
