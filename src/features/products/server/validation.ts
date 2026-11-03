/**
 * Product validation service: the 12 steps (created on first use), evidence,
 * interviews, competitors and the demand-evidence summary.
 */
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Tx } from "@/db/drizzle";
import { productCompetitors, productInterviews, productMetrics, products, productValidationEvidence, productValidationSteps } from "@/db/schema";
import { requireWorkspace } from "@/features/goals/server/service";
import { demandEvidence, followUpDue, VALIDATION_STEP_META, VALIDATION_STEPS, type DemandEvidence, type ValidationStep } from "@/lib/domain/product-validation";
import { notFound } from "@/lib/errors";
import type { StepUpdateInput } from "../schemas";

/** Creates any missing steps with their default success criteria. Idempotent. */
export async function ensureSteps(tx: Tx, productId: string) {
  await tx
    .insert(productValidationSteps)
    .values(VALIDATION_STEPS.map((step) => ({ productId, step, successCriteria: VALIDATION_STEP_META[step].criteria })))
    .onConflictDoNothing({ target: [productValidationSteps.productId, productValidationSteps.step] });
}

async function assertProduct(tx: Tx, productId: string) {
  const [p] = await tx.select().from(products).where(eq(products.id, productId)).limit(1);
  if (!p) throw notFound("Product");
  return p;
}

/** Demand evidence for many products at once (portfolio). */
export async function demandFor(tx: Tx, productIds: string[]): Promise<Map<string, DemandEvidence>> {
  const out = new Map<string, DemandEvidence>();
  if (!productIds.length) return out;
  const rows = await tx.select({ id: products.id, stage: products.stage }).from(products).where(inArray(products.id, productIds));
  const interviews = await tx
    .select({ productId: productInterviews.productId, confirmsProblem: productInterviews.confirmsProblem, willingness: productInterviews.willingness, statedPrice: productInterviews.statedPrice })
    .from(productInterviews)
    .where(inArray(productInterviews.productId, productIds));
  const evidence = await tx
    .select({ productId: productValidationEvidence.productId, step: productValidationEvidence.step, kind: productValidationEvidence.kind, value: productValidationEvidence.value })
    .from(productValidationEvidence)
    .where(inArray(productValidationEvidence.productId, productIds));
  const steps = await tx
    .select({ productId: productValidationSteps.productId, step: productValidationSteps.step, status: productValidationSteps.status })
    .from(productValidationSteps)
    .where(inArray(productValidationSteps.productId, productIds));
  const metrics = await tx.select().from(productMetrics).where(inArray(productMetrics.productId, productIds));
  for (const p of rows) {
    out.set(
      p.id,
      demandEvidence({
        stage: p.stage,
        interviews: interviews.filter((i) => i.productId === p.id),
        evidence: evidence.filter((e) => e.productId === p.id),
        steps: steps.filter((s) => s.productId === p.id),
        metrics: metrics.filter((m) => m.productId === p.id),
      }),
    );
  }
  return out;
}

export async function getValidation(tx: Tx, productId: string) {
  const ws = await requireWorkspace(tx);
  await assertProduct(tx, productId);
  // Reads never write: steps without a row yet show their defaults.
  const rows = await tx.select().from(productValidationSteps).where(eq(productValidationSteps.productId, productId));
  const byStep = new Map(rows.map((r) => [r.step, r]));
  const steps = VALIDATION_STEPS.map((step) => {
    const r = byStep.get(step);
    return {
      step,
      status: r?.status ?? ("not_started" as const),
      successCriteria: r?.successCriteria ?? VALIDATION_STEP_META[step].criteria,
      notes: r?.notes ?? null,
      decidedOn: r?.decidedOn ?? null,
    };
  });
  const evidence = await tx
    .select()
    .from(productValidationEvidence)
    .where(eq(productValidationEvidence.productId, productId))
    .orderBy(desc(productValidationEvidence.observedOn), desc(productValidationEvidence.createdAt));
  const interviews = await tx
    .select()
    .from(productInterviews)
    .where(eq(productInterviews.productId, productId))
    .orderBy(desc(productInterviews.interviewedOn), desc(productInterviews.createdAt));
  const competitors = await tx.select().from(productCompetitors).where(eq(productCompetitors.productId, productId)).orderBy(asc(productCompetitors.name));
  const demand = (await demandFor(tx, [productId])).get(productId)!;
  return {
    today: ws.today,
    steps: steps.map((s) => ({ ...s, label: VALIDATION_STEP_META[s.step].label, evidence: evidence.filter((e) => e.step === s.step) })),
    interviews: interviews.map((i) => ({ ...i, followUpDue: followUpDue(i, ws.today) })),
    competitors,
    demand,
    followUpsDue: interviews.filter((i) => followUpDue(i, ws.today)).length,
  };
}

export async function updateStep(tx: Tx, productId: string, step: ValidationStep, patch: StepUpdateInput) {
  await assertProduct(tx, productId);
  await ensureSteps(tx, productId);
  const [row] = await tx
    .update(productValidationSteps)
    .set(patch)
    .where(and(eq(productValidationSteps.productId, productId), eq(productValidationSteps.step, step)))
    .returning();
  return row;
}

/** Interview follow-ups due today or overdue, across products (for Today). */
export async function interviewFollowUpsDue(tx: Tx, today: string) {
  return tx
    .select({ id: productInterviews.id, productId: productInterviews.productId, productName: products.name, customerName: productInterviews.customerName, customerType: productInterviews.customerType, followUpOn: productInterviews.followUpOn })
    .from(productInterviews)
    .innerJoin(products, eq(products.id, productInterviews.productId))
    .where(and(eq(productInterviews.followUpDone, false), sql`${productInterviews.followUpOn} <= ${today}`, sql`${products.archivedAt} is null`))
    .orderBy(asc(productInterviews.followUpOn));
}
