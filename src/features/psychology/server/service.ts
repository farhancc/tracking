/**
 * Sales psychology lab service: concepts, spaced-repetition reviews,
 * real-world applications and progress statistics.
 */
import { and, asc, count, countDistinct, desc, eq, gte, ilike, inArray, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import type { Tx } from "@/db/drizzle";
import { psychApplications, psychConcepts, psychReviews } from "@/db/schema";
import { requireWorkspace } from "@/features/goals/server/service";
import { addDays } from "@/lib/domain/dates";
import { canMarkDeep, needsFurtherStudy, scheduleReview, type ReviewRating, type Understanding } from "@/lib/domain/psychology";
import { AppError, notFound } from "@/lib/errors";
import type { ApplicationCreateInput, ConceptCreateInput, ConceptUpdateInput } from "../schemas";

export type ConceptRow = typeof psychConcepts.$inferSelect;

async function findConcept(tx: Tx, id: string): Promise<ConceptRow> {
  const [c] = await tx.select().from(psychConcepts).where(eq(psychConcepts.id, id)).limit(1);
  if (!c) throw notFound("Concept");
  return c;
}

export async function createConcept(tx: Tx, input: ConceptCreateInput) {
  const ws = await requireWorkspace(tx);
  if (input.understanding === "deep") {
    throw new AppError(422, "deep_understanding_not_earned", "A new concept can't start as “understood deeply”. Review it and apply it first.");
  }
  const learnedOn = input.learnedOn ?? ws.today;
  const [row] = await tx
    .insert(psychConcepts)
    // New concepts are first reviewed the next day.
    .values({ ...input, learnedOn, srDueOn: addDays(learnedOn > ws.today ? ws.today : learnedOn, 1) })
    .returning();
  return row;
}

export async function updateConcept(tx: Tx, id: string, patch: ConceptUpdateInput) {
  const current = await findConcept(tx, id);
  const { archived, ...rest } = patch;
  if (rest.understanding === "deep" && current.understanding !== "deep") {
    const evidence = await deepEvidence(tx, id);
    const check = canMarkDeep(evidence);
    if (!check.allowed) throw new AppError(422, "deep_understanding_not_earned", check.reasons.join(" "));
  }
  const [row] = await tx
    .update(psychConcepts)
    .set({ ...rest, ...(archived !== undefined ? { archivedAt: archived ? new Date() : null } : {}) })
    .where(eq(psychConcepts.id, id))
    .returning();
  return row;
}

async function deepEvidence(tx: Tx, conceptId: string) {
  const [r] = await tx
    .select({ n: count() })
    .from(psychReviews)
    .where(and(eq(psychReviews.conceptId, conceptId), inArray(psychReviews.rating, ["good", "easy"])));
  const [a] = await tx
    .select({ n: count() })
    .from(psychApplications)
    .where(and(eq(psychApplications.conceptId, conceptId), sql`${psychApplications.outcome} <> 'inconclusive'`, sql`length(btrim(coalesce(${psychApplications.result}, ''))) > 0`));
  return { successfulReviews: r.n, applicationsWithResult: a.n };
}

export async function listConcepts(tx: Tx, filter: { category?: string; evidence?: string; understanding?: string; q?: string } = {}) {
  const where: SQL[] = [isNull(psychConcepts.archivedAt)];
  if (filter.category) where.push(eq(psychConcepts.category, filter.category as ConceptRow["category"]));
  if (filter.evidence) where.push(eq(psychConcepts.evidenceLevel, filter.evidence as ConceptRow["evidenceLevel"]));
  if (filter.understanding) where.push(eq(psychConcepts.understanding, filter.understanding as ConceptRow["understanding"]));
  if (filter.q) {
    const q = `%${filter.q}%`;
    where.push(or(ilike(psychConcepts.concept, q), ilike(psychConcepts.explanation, q), ilike(psychConcepts.takeaways, q), ilike(psychConcepts.sourceTitle, q))!);
  }
  return tx.select().from(psychConcepts).where(and(...where)).orderBy(asc(psychConcepts.category), asc(psychConcepts.concept));
}

/** Concepts due for review today or earlier, oldest first. */
export async function reviewQueue(tx: Tx, dayArg?: string) {
  const ws = await requireWorkspace(tx);
  const day = dayArg ?? ws.today;
  return tx
    .select()
    .from(psychConcepts)
    .where(and(isNull(psychConcepts.archivedAt), lte(psychConcepts.srDueOn, day)))
    .orderBy(asc(psychConcepts.srDueOn), asc(psychConcepts.createdAt));
}

export async function reviewConcept(tx: Tx, id: string, rating: ReviewRating, dayArg?: string) {
  const ws = await requireWorkspace(tx);
  const day = dayArg ?? ws.today;
  const c = await findConcept(tx, id);
  const next = scheduleReview({ ease: c.srEase, intervalDays: c.srIntervalDays, repetitions: c.srRepetitions, lapses: c.srLapses }, rating, day);
  await tx.insert(psychReviews).values({ conceptId: id, reviewedOn: day, rating, intervalBefore: c.srIntervalDays, intervalAfter: next.intervalDays });
  const understanding: Understanding =
    rating === "again" && c.understanding !== "needs_study" && c.srLapses + 1 >= 2 ? "needs_study" : c.understanding === "new" ? "learning" : (c.understanding as Understanding);
  const [row] = await tx
    .update(psychConcepts)
    .set({
      srEase: next.ease,
      srIntervalDays: next.intervalDays,
      srRepetitions: next.repetitions,
      srLapses: next.lapses,
      srDueOn: next.dueOn,
      lastReviewedOn: day,
      lastRating: rating,
      understanding,
    })
    .where(eq(psychConcepts.id, id))
    .returning();
  return row;
}

export async function addApplication(tx: Tx, conceptId: string, input: ApplicationCreateInput) {
  const ws = await requireWorkspace(tx);
  await findConcept(tx, conceptId);
  const [row] = await tx.insert(psychApplications).values({ ...input, conceptId, appliedOn: input.appliedOn ?? ws.today }).returning();
  return row;
}

export async function deleteApplication(tx: Tx, id: string) {
  const rows = await tx.delete(psychApplications).where(eq(psychApplications.id, id)).returning({ id: psychApplications.id });
  if (!rows.length) throw notFound("Application");
}

export async function getConcept(tx: Tx, id: string) {
  const c = await findConcept(tx, id);
  const reviews = await tx.select().from(psychReviews).where(eq(psychReviews.conceptId, id)).orderBy(desc(psychReviews.reviewedOn), desc(psychReviews.createdAt));
  const applications = await tx.select().from(psychApplications).where(eq(psychApplications.conceptId, id)).orderBy(desc(psychApplications.appliedOn));
  const evidence = await deepEvidence(tx, id);
  return {
    concept: c,
    reviews,
    applications,
    deepCheck: canMarkDeep(evidence),
    needsStudy: needsFurtherStudy({ understanding: c.understanding as Understanding, lapses: c.srLapses, lastRating: c.lastRating as ReviewRating | null }),
  };
}

/** Learned, reviewed, applied, understood deeply, needs further study (all-time and last 30 days). */
export async function getStats(tx: Tx, dayArg?: string) {
  const ws = await requireWorkspace(tx);
  const day = dayArg ?? ws.today;
  const since = addDays(day, -29);
  const concepts = await tx.select().from(psychConcepts).where(isNull(psychConcepts.archivedAt));
  const [reviewed] = await tx.select({ concepts: countDistinct(psychReviews.conceptId), reviews: count() }).from(psychReviews);
  const [reviewed30] = await tx
    .select({ concepts: countDistinct(psychReviews.conceptId), reviews: count() })
    .from(psychReviews)
    .where(and(gte(psychReviews.reviewedOn, since), lte(psychReviews.reviewedOn, day)));
  const [applied] = await tx.select({ concepts: countDistinct(psychApplications.conceptId), n: count() }).from(psychApplications);
  const due = concepts.filter((c) => c.srDueOn <= day).length;
  const byEvidence = Object.fromEntries(
    (["strong", "moderate", "limited", "practitioner", "speculative"] as const).map((e) => [e, concepts.filter((c) => c.evidenceLevel === e).length]),
  ) as Record<ConceptRow["evidenceLevel"], number>;
  return {
    learned: concepts.length,
    learnedLast30: concepts.filter((c) => c.learnedOn >= since && c.learnedOn <= day).length,
    reviewedConcepts: reviewed.concepts,
    reviews: reviewed.reviews,
    reviewedLast30: reviewed30.concepts,
    reviewsLast30: reviewed30.reviews,
    appliedConcepts: applied.concepts,
    applications: applied.n,
    understoodDeeply: concepts.filter((c) => c.understanding === "deep").length,
    needsStudy: concepts.filter((c) => needsFurtherStudy({ understanding: c.understanding as Understanding, lapses: c.srLapses, lastRating: c.lastRating as ReviewRating | null })).length,
    dueToday: due,
    evidenceBased: byEvidence.strong + byEvidence.moderate,
    byEvidence,
  };
}
