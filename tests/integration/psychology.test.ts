import { afterAll, describe, expect, it } from "vitest";
import { applicationCreateSchema, conceptCreateSchema } from "../../src/features/psychology/schemas";
import { addApplication, createConcept, getConcept, getStats, listConcepts, reviewConcept, reviewQueue, updateConcept } from "../../src/features/psychology/server/service";
import { connect, rejectsWith } from "./helpers";

const h = connect();
afterAll(() => h.close());

const concept = (over: Record<string, unknown> = {}) =>
  conceptCreateSchema.parse({
    category: "cognitive_biases",
    concept: "Anchoring",
    explanation: "The first number mentioned pulls later estimates toward it.",
    sourceTitle: "Judgment under Uncertainty",
    sourceAuthor: "Tversky & Kahneman",
    sourceType: "peer_reviewed",
    evidenceLevel: "strong",
    ethics: "Anchor with a genuine reference price, never a fake one.",
    whereToApply: "Opening price in proposals",
    learnedOn: "2026-10-01",
    ...over,
  });

describe("sales psychology lab", () => {
  it("schedules reviews and only allows deep understanding once earned", async () => {
    const o = await h.newOwner();
    const c = await h.as(o.userId, (tx) => createConcept(tx, concept()));
    expect(c.srDueOn).toBe("2026-10-02");
    expect((await h.as(o.userId, (tx) => reviewQueue(tx, "2026-10-01"))).length).toBe(0);
    expect((await h.as(o.userId, (tx) => reviewQueue(tx, "2026-10-02"))).map((x) => x.concept)).toEqual(["Anchoring"]);

    await h.as(o.userId, (tx) => reviewConcept(tx, c.id, "good", "2026-10-02"));
    await h.as(o.userId, (tx) => reviewConcept(tx, c.id, "good", "2026-10-03"));
    const third = await h.as(o.userId, (tx) => reviewConcept(tx, c.id, "good", "2026-10-06"));
    expect(third).toMatchObject({ srRepetitions: 3, srIntervalDays: 8, srDueOn: "2026-10-14", understanding: "learning" });

    // Three good reviews are not enough: it hasn't been applied yet.
    await expect(h.as(o.userId, (tx) => updateConcept(tx, c.id, { understanding: "deep" }))).rejects.toMatchObject({ code: "deep_understanding_not_earned" });
    await rejectsWith(h.as(o.userId, (tx) => tx.execute(`update psych_concepts set understanding = 'deep' where id = '${c.id}'`)), { detail: "deep_understanding_not_earned" });

    await h.as(o.userId, (tx) =>
      addApplication(tx, c.id, applicationCreateSchema.parse({ appliedOn: "2026-10-07", context: "Proposal to Acme", action: "Led with the premium tier", result: "Settled on the mid tier, 20% above their budget", outcome: "worked" })),
    );
    const deep = await h.as(o.userId, (tx) => updateConcept(tx, c.id, { understanding: "deep" }));
    expect(deep.understanding).toBe("deep");
    await expect(h.as(o.userId, (tx) => createConcept(tx, concept({ concept: "Reciprocity", understanding: "deep" })))).rejects.toMatchObject({ code: "deep_understanding_not_earned" });
  });

  it("flags concepts that need further study and reports progress", async () => {
    const o = await h.newOwner();
    const a = await h.as(o.userId, (tx) => createConcept(tx, concept()));
    const b = await h.as(o.userId, (tx) =>
      createConcept(tx, concept({ concept: "Power posing", category: "influence", evidenceLevel: "speculative", sourceType: "video", explanation: "Expansive posture raises confidence hormones." })),
    );
    await h.as(o.userId, (tx) => reviewConcept(tx, b.id, "again", "2026-10-02"));
    const lapsed = await h.as(o.userId, (tx) => reviewConcept(tx, b.id, "again", "2026-10-03"));
    expect(lapsed.understanding).toBe("needs_study");
    await h.as(o.userId, (tx) => reviewConcept(tx, a.id, "easy", "2026-10-02"));
    await h.as(o.userId, (tx) => addApplication(tx, a.id, applicationCreateSchema.parse({ appliedOn: "2026-10-04", context: "Cold call", outcome: "mixed", result: "Prospect pushed back" })));

    const stats = await h.as(o.userId, (tx) => getStats(tx, "2026-10-05"));
    expect(stats).toMatchObject({ learned: 2, reviewedConcepts: 2, reviews: 3, appliedConcepts: 1, understoodDeeply: 0, needsStudy: 1, evidenceBased: 1 });
    expect(stats.byEvidence.speculative).toBe(1);
    expect((await h.as(o.userId, (tx) => listConcepts(tx, { evidence: "speculative" }))).map((c) => c.concept)).toEqual(["Power posing"]);
    expect((await h.as(o.userId, (tx) => listConcepts(tx, { q: "first number" }))).map((c) => c.concept)).toEqual(["Anchoring"]);
    const detail = await h.as(o.userId, (tx) => getConcept(tx, b.id));
    expect(detail.reviews.map((r) => r.rating)).toEqual(["again", "again"]);
    expect(detail.needsStudy).toBe(true);
  });
});
