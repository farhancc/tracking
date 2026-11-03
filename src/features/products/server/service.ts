/**
 * Product portfolio service. Every figure shown is computed from recorded
 * actuals (ledger entries and monthly metrics); forecasts (planned dates)
 * are stored separately and never mixed into the numbers.
 */
import { and, asc, count, desc, eq, gte, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import type { Tx } from "@/db/drizzle";
import {
  goals,
  productBugs,
  productFeatures,
  productCompetitors,
  productFeedback,
  productInterviews,
  productMetrics,
  productMilestones,
  productReleases,
  products,
  productStageEvents,
  productTransactions,
  productValidationEvidence,
} from "@/db/schema";
import { requireWorkspace } from "@/features/goals/server/service";
import { addDays, addMonths, type IsoDate } from "@/lib/domain/dates";
import {
  assessProduct,
  categoryKind,
  churnRate,
  isLaunchedStage,
  monthlyFinance,
  monthOf,
  sumFinance,
  type Assessment,
  type MonthlyMetric,
  type TransactionCategory,
  type TransactionInput as LedgerEntry,
} from "@/lib/domain/products";
import { needsValidationGate, type DemandEvidence } from "@/lib/domain/product-validation";
import { AppError, notFound } from "@/lib/errors";
import { patchOf } from "@/lib/validation";
import { demandFor, ensureSteps } from "./validation";
import {
  bugSchema,
  bugUpdateSchema,
  competitorSchema,
  evidenceSchema,
  interviewSchema,
  featureSchema,
  featureUpdateSchema,
  feedbackSchema,
  feedbackUpdateSchema,
  metricSchema,
  milestoneSchema,
  milestoneUpdateSchema,
  releaseSchema,
  releaseUpdateSchema,
  transactionSchema,
  transactionUpdateSchema,
  type Collection,
  type ProductCreateInput,
  type ProductUpdateInput,
} from "../schemas";

export type ProductRow = typeof products.$inferSelect;

async function findProduct(tx: Tx, id: string): Promise<ProductRow> {
  const [p] = await tx.select().from(products).where(eq(products.id, id)).limit(1);
  if (!p) throw notFound("Product");
  return p;
}

export async function createProduct(tx: Tx, input: ProductCreateInput) {
  const ws = await requireWorkspace(tx);
  if (isLaunchedStage(input.stage) && !input.launchedOn) {
    throw new AppError(422, "validation_failed", "A launched product needs its launch date.", { launchedOn: ["Enter the date it went on sale."] });
  }
  const startedOn = input.startedOn ?? ws.today;
  const [row] = await tx
    .insert(products)
    .values({ ...input, startedOn, stageEnteredOn: startedOn, currency: input.currency ?? ws.profile?.baseCurrency ?? "USD" })
    .returning();
  return row;
}

export async function updateProduct(tx: Tx, id: string, patch: ProductUpdateInput) {
  const ws = await requireWorkspace(tx);
  const current = await findProduct(tx, id);
  const { archived, acknowledgeUnvalidated, ...rest } = patch;
  const stage = rest.stage ?? current.stage;
  if (rest.stage && rest.stage !== current.stage) {
    const demand = (await demandFor(tx, [id])).get(id)!;
    if (needsValidationGate(current.stage, rest.stage, demand.level)) {
      if (!acknowledgeUnvalidated) {
        throw new AppError(
          409,
          "validation_required",
          `Demand evidence is at "${demand.levelLabel}". Moving to ${rest.stage === "mvp" ? "MVP" : rest.stage} before at least 3 customers commit to pay risks building something nobody wants. Get commitments first, or confirm and give a reason.`,
        );
      }
      if (!(rest.statusNote ?? "").trim()) {
        throw new AppError(422, "validation_failed", "Say why you are building without demand evidence.", { statusNote: ["Give a reason."] });
      }
    }
  }
  // Moving into a launched stage now means it launched today unless a date is given.
  if (isLaunchedStage(stage) && !(rest.launchedOn ?? current.launchedOn)) rest.launchedOn = ws.today;
  if (rest.launchedOn === null && isLaunchedStage(stage)) {
    throw new AppError(422, "validation_failed", "A launched product needs its launch date.", { launchedOn: ["Enter the date it went on sale."] });
  }
  const [row] = await tx
    .update(products)
    .set({ ...rest, ...(archived !== undefined ? { archivedAt: archived ? new Date() : null } : {}) })
    .where(eq(products.id, id))
    .returning();
  return row;
}

// ---------------------------------------------------------------------------
// Analytics

type Signals = {
  metrics: MonthlyMetric[];
  ledger: LedgerEntry[];
  feedbackLast90: number;
  openCriticalBugs: number;
};

async function loadSignals(tx: Tx, productIds: string[], today: IsoDate): Promise<Map<string, Signals>> {
  const out = new Map<string, Signals>(productIds.map((id) => [id, { metrics: [], ledger: [], feedbackLast90: 0, openCriticalBugs: 0 }]));
  if (!productIds.length) return out;
  const metricRows = await tx.select().from(productMetrics).where(inArray(productMetrics.productId, productIds)).orderBy(asc(productMetrics.month));
  for (const m of metricRows) out.get(m.productId)!.metrics.push(toMetric(m));
  // Ledger aggregated per day and category keeps this cheap over five years.
  const ledgerRows = await tx
    .select({
      productId: productTransactions.productId,
      occurredOn: productTransactions.occurredOn,
      category: productTransactions.category,
      amount: sql<string>`sum(${productTransactions.amount})`,
    })
    .from(productTransactions)
    .where(inArray(productTransactions.productId, productIds))
    .groupBy(productTransactions.productId, productTransactions.occurredOn, productTransactions.category);
  for (const r of ledgerRows) out.get(r.productId)!.ledger.push({ occurredOn: r.occurredOn, category: r.category as TransactionCategory, amount: Number(r.amount) });
  const fb = await tx
    .select({ productId: productFeedback.productId, n: count() })
    .from(productFeedback)
    .where(and(inArray(productFeedback.productId, productIds), gte(productFeedback.receivedOn, addDays(today, -90))))
    .groupBy(productFeedback.productId);
  for (const r of fb) out.get(r.productId)!.feedbackLast90 = r.n;
  const bugs = await tx
    .select({ productId: productBugs.productId, n: count() })
    .from(productBugs)
    .where(and(inArray(productBugs.productId, productIds), eq(productBugs.severity, "critical"), inArray(productBugs.status, ["open", "in_progress"])))
    .groupBy(productBugs.productId);
  for (const r of bugs) out.get(r.productId)!.openCriticalBugs = r.n;
  return out;
}

const toMetric = (m: typeof productMetrics.$inferSelect): MonthlyMetric => ({
  month: m.month,
  mrr: m.mrr,
  activeCustomers: m.activeCustomers,
  newCustomers: m.newCustomers,
  churnedCustomers: m.churnedCustomers,
});

/** The last three complete calendar months. */
export function recentWindow(today: IsoDate) {
  const thisMonth = monthOf(today);
  return { from: addMonths(thisMonth, -3), to: addDays(thisMonth, -1) };
}

function summarize(p: ProductRow, s: Signals, today: IsoDate, demand?: DemandEvidence) {
  const win = recentWindow(today);
  const recent = s.ledger.filter((t) => t.occurredOn >= win.from && t.occurredOn <= win.to);
  const lastMonth = s.ledger.filter((t) => t.occurredOn >= addMonths(monthOf(today), -1) && t.occurredOn < monthOf(today));
  const thisMonth = s.ledger.filter((t) => t.occurredOn >= monthOf(today));
  const latest = s.metrics.at(-1) ?? null;
  const assessment: Assessment = assessProduct({
    stage: p.stage,
    status: p.status,
    today,
    stageEnteredOn: p.stageEnteredOn,
    launchedOn: p.launchedOn,
    metrics: s.metrics,
    recentFinance: sumFinance(recent),
    feedbackLast90: s.feedbackLast90,
    openCriticalBugs: s.openCriticalBugs,
    currency: p.currency,
    validation: demand ? { validatedMilestones: demand.validatedSteps, interviews: demand.interviews, willingToPay: demand.committed + demand.presales.count, level: demand.level } : null,
  });
  return {
    lifetime: sumFinance(s.ledger),
    recent3Months: sumFinance(recent),
    lastMonth: sumFinance(lastMonth),
    thisMonthToDate: sumFinance(thisMonth),
    latestMetrics: latest ? { ...latest, churnRate: churnRate(latest) } : null,
    feedbackLast90: s.feedbackLast90,
    openCriticalBugs: s.openCriticalBugs,
    demand: demand ?? null,
    assessment,
  };
}

export async function getPortfolio(tx: Tx, opts: { includeArchived?: boolean } = {}) {
  const ws = await requireWorkspace(tx);
  const rows = await tx
    .select()
    .from(products)
    .where(opts.includeArchived ? undefined : isNull(products.archivedAt))
    .orderBy(asc(products.name));
  const ids = rows.map((r) => r.id);
  const signals = await loadSignals(tx, ids, ws.today);
  const demand = await demandFor(tx, ids);
  const items = rows.map((p) => ({ product: p, ...summarize(p, signals.get(p.id)!, ws.today, demand.get(p.id)) }));
  // Money is never summed across currencies.
  const totals = new Map<string, { currency: string; mrr: number; lifetimeProfit: number; recentProfit: number; products: number; activeCustomers: number }>();
  for (const i of items) {
    if (i.product.status === "discontinued") continue;
    const t = totals.get(i.product.currency) ?? { currency: i.product.currency, mrr: 0, lifetimeProfit: 0, recentProfit: 0, products: 0, activeCustomers: 0 };
    t.products += 1;
    t.mrr += i.latestMetrics?.mrr ?? 0;
    t.activeCustomers += i.latestMetrics?.activeCustomers ?? 0;
    t.lifetimeProfit += i.lifetime.profit;
    t.recentProfit += i.recent3Months.profit;
    totals.set(i.product.currency, t);
  }
  return { today: ws.today, window: recentWindow(ws.today), items, totals: [...totals.values()] };
}

export async function getProduct(tx: Tx, id: string) {
  const ws = await requireWorkspace(tx);
  const p = await findProduct(tx, id);
  const signals = (await loadSignals(tx, [p.id], ws.today)).get(p.id)!;
  const summary = summarize(p, signals, ws.today, (await demandFor(tx, [p.id])).get(p.id));
  const goal = p.goalId ? (await tx.select({ id: goals.id, title: goals.title }).from(goals).where(eq(goals.id, p.goalId)).limit(1))[0] ?? null : null;
  const stageEvents = await tx.select().from(productStageEvents).where(eq(productStageEvents.productId, id)).orderBy(asc(productStageEvents.createdAt));
  const metrics = await tx.select().from(productMetrics).where(eq(productMetrics.productId, id)).orderBy(desc(productMetrics.month));
  const milestones = await tx
    .select()
    .from(productMilestones)
    .where(eq(productMilestones.productId, id))
    .orderBy(sql`${productMilestones.status} = 'open' desc`, asc(productMilestones.dueOn), asc(productMilestones.createdAt));
  const releases = await tx.select().from(productReleases).where(eq(productReleases.productId, id)).orderBy(sql`${productReleases.releasedOn} desc nulls first`, desc(productReleases.createdAt));
  const featureRows = await tx.select().from(productFeatures).where(eq(productFeatures.productId, id)).orderBy(asc(productFeatures.createdAt));
  const requestRows = await tx
    .select({ featureId: productFeedback.featureId, n: count() })
    .from(productFeedback)
    .where(and(eq(productFeedback.productId, id), isNotNull(productFeedback.featureId)))
    .groupBy(productFeedback.featureId);
  const requests = new Map(requestRows.map((r) => [r.featureId, r.n]));
  const features = featureRows.map((feature) => ({ feature, requests: requests.get(feature.id) ?? 0 }));
  const feedback = await tx.select().from(productFeedback).where(eq(productFeedback.productId, id)).orderBy(desc(productFeedback.receivedOn), desc(productFeedback.createdAt)).limit(200);
  const bugs = await tx.select().from(productBugs).where(eq(productBugs.productId, id)).orderBy(asc(productBugs.status), asc(productBugs.reportedOn));
  return { today: ws.today, product: p, goal, stageEvents, metrics, milestones, releases, features, feedback, bugs, ...summary };
}

/** Separate revenue and expense report for one product. */
export async function getReport(tx: Tx, id: string, q: { from?: string; to?: string }) {
  const ws = await requireWorkspace(tx);
  const p = await findProduct(tx, id);
  const to = q.to ?? ws.today;
  const from = q.from ?? (addMonths(monthOf(to), -11) > p.startedOn ? addMonths(monthOf(to), -11) : monthOf(p.startedOn));
  if (from > to) throw new AppError(422, "validation_failed", "The report must start on or before its end date.");
  const all = await tx
    .select()
    .from(productTransactions)
    .where(and(eq(productTransactions.productId, id), lte(productTransactions.occurredOn, to)))
    .orderBy(asc(productTransactions.occurredOn), asc(productTransactions.createdAt));
  const ledger = all.map((t) => ({ occurredOn: t.occurredOn, category: t.category, amount: t.amount }));
  const inRange = all.filter((t) => t.occurredOn >= from);
  const months = monthlyFinance(ledger, from, to);
  const totals = sumFinance(inRange.map((t) => ({ occurredOn: t.occurredOn, category: t.category, amount: t.amount })));
  const byCategory: Partial<Record<TransactionCategory, number>> = {};
  for (const t of inRange) byCategory[t.category] = Math.round(((byCategory[t.category] ?? 0) + t.amount) * 100) / 100;
  return { product: { id: p.id, name: p.name, currency: p.currency }, from, to, months, totals, byCategory, transactions: inRange.reverse() };
}

// ---------------------------------------------------------------------------
// Child collections

async function releaseDate(tx: Tx, productId: string, releaseId: string | null | undefined) {
  if (!releaseId) return null;
  const [r] = await tx
    .select({ releasedOn: productReleases.releasedOn })
    .from(productReleases)
    .where(and(eq(productReleases.id, releaseId), eq(productReleases.productId, productId)))
    .limit(1);
  if (!r) throw new AppError(422, "validation_failed", "That release belongs to another product.", { releaseId: ["Pick a release of this product."] });
  return r.releasedOn;
}

type Item = Record<string, unknown>;

/** Applies the status ⇄ date rules so "done", "shipped" and "fixed" always carry a date. */
async function normalize(tx: Tx, collection: Collection, productId: string, merged: Item, today: IsoDate): Promise<Item> {
  switch (collection) {
    case "transactions":
      return { ...merged, kind: categoryKind(merged.category as TransactionCategory), occurredOn: merged.occurredOn ?? today };
    case "milestones":
      if (merged.completedOn && merged.status === "open") merged.status = "done";
      return { ...merged, completedOn: merged.status === "done" ? (merged.completedOn ?? today) : null };
    case "features": {
      const released = await releaseDate(tx, productId, merged.releaseId as string | null);
      return { ...merged, shippedOn: merged.status === "shipped" ? (merged.shippedOn ?? released ?? today) : null };
    }
    case "bugs":
      await releaseDate(tx, productId, merged.releaseId as string | null);
      return { ...merged, reportedOn: merged.reportedOn ?? today, fixedOn: merged.status === "fixed" ? (merged.fixedOn ?? today) : null };
    case "feedback":
      if (merged.featureId) {
        const [f] = await tx
          .select({ id: productFeatures.id })
          .from(productFeatures)
          .where(and(eq(productFeatures.id, merged.featureId as string), eq(productFeatures.productId, productId)))
          .limit(1);
        if (!f) throw new AppError(422, "validation_failed", "That feature belongs to another product.", { featureId: ["Pick a feature of this product."] });
      }
      return { ...merged, receivedOn: merged.receivedOn ?? today };
    case "interviews":
      return { ...merged, interviewedOn: merged.interviewedOn ?? today };
    case "evidence":
      await ensureSteps(tx, productId);
      return { ...merged, observedOn: merged.observedOn ?? today };
    default:
      return merged;
  }
}

const TABLES = {
  metrics: productMetrics,
  transactions: productTransactions,
  milestones: productMilestones,
  releases: productReleases,
  features: productFeatures,
  feedback: productFeedback,
  bugs: productBugs,
  interviews: productInterviews,
  competitors: productCompetitors,
  evidence: productValidationEvidence,
} as const;

const CREATE = {
  metrics: metricSchema,
  transactions: transactionSchema,
  milestones: milestoneSchema,
  releases: releaseSchema,
  features: featureSchema,
  feedback: feedbackSchema,
  bugs: bugSchema,
  interviews: interviewSchema,
  competitors: competitorSchema,
  evidence: evidenceSchema,
} as const;

const UPDATE = {
  metrics: patchOf(metricSchema),
  transactions: transactionUpdateSchema,
  milestones: milestoneUpdateSchema,
  releases: releaseUpdateSchema,
  features: featureUpdateSchema,
  feedback: feedbackUpdateSchema,
  bugs: bugUpdateSchema,
  interviews: patchOf(interviewSchema),
  competitors: patchOf(competitorSchema),
  evidence: patchOf(evidenceSchema),
} as const;

export async function createItem(tx: Tx, productId: string, collection: Collection, body: unknown) {
  const ws = await requireWorkspace(tx);
  await findProduct(tx, productId);
  const input = CREATE[collection].parse(body) as Item;
  const values = { ...(await normalize(tx, collection, productId, input, ws.today)), productId };
  const table = TABLES[collection];
  if (collection === "metrics") {
    // One row per product and month: recording a month again corrects it.
    const [row] = await tx
      .insert(productMetrics)
      .values(values as typeof productMetrics.$inferInsert)
      .onConflictDoUpdate({
        target: [productMetrics.productId, productMetrics.month],
        set: { mrr: sql`excluded.mrr`, activeCustomers: sql`excluded.active_customers`, newCustomers: sql`excluded.new_customers`, churnedCustomers: sql`excluded.churned_customers`, notes: sql`excluded.notes` },
      })
      .returning();
    return row;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [row] = await tx.insert(table).values(values as any).returning();
  return row;
}

async function findItem(tx: Tx, productId: string, collection: Collection, itemId: string): Promise<Item> {
  const table = TABLES[collection];
  const [row] = await tx
    .select()
    .from(table)
    .where(and(eq(table.id, itemId), eq(table.productId, productId)))
    .limit(1);
  if (!row) throw notFound("Item");
  return row as Item;
}

export async function updateItem(tx: Tx, productId: string, collection: Collection, itemId: string, body: unknown) {
  const ws = await requireWorkspace(tx);
  const current = await findItem(tx, productId, collection, itemId);
  const patch = UPDATE[collection].parse(body) as Item;
  const merged = await normalize(tx, collection, productId, { ...current, ...patch }, ws.today);
  // Only write columns the schema allows plus derived ones.
  const allowed = new Set([...Object.keys(CREATE[collection].shape), "kind", "completedOn", "shippedOn", "fixedOn", "status"]);
  const set = Object.fromEntries(Object.entries(merged).filter(([k]) => allowed.has(k) && k in current));
  const table = TABLES[collection];
  const [row] = await tx
    .update(table)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .set(set as any)
    .where(and(eq(table.id, itemId), eq(table.productId, productId)))
    .returning();
  return row;
}

export async function deleteItem(tx: Tx, productId: string, collection: Collection, itemId: string) {
  await findItem(tx, productId, collection, itemId);
  if (collection === "releases") {
    await tx.update(productFeatures).set({ releaseId: null }).where(eq(productFeatures.releaseId, itemId));
    await tx.update(productBugs).set({ releaseId: null }).where(eq(productBugs.releaseId, itemId));
  }
  if (collection === "features") {
    await tx.update(productFeedback).set({ featureId: null }).where(eq(productFeedback.featureId, itemId));
  }
  const table = TABLES[collection];
  await tx.delete(table).where(and(eq(table.id, itemId), eq(table.productId, productId)));
  return { deleted: true };
}
