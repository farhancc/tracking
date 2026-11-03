import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { psychConcepts, salesJournalEntries, tasks } from "../../src/db/schema";
import { resourceCreateSchema, sessionSchema } from "../../src/features/knowledge/schemas";
import {
  addApplication,
  addConcept,
  createResource,
  deleteConcept,
  getOverview,
  getReading,
  getResource,
  journalFromApplication,
  listResources,
  logSession,
  promoteConcept,
  setGoal,
  updateApplication,
  updateResource,
} from "../../src/features/knowledge/server/service";
import { addDays, todayIn } from "../../src/lib/domain/dates";
import { connect, rejectsWith } from "./helpers";

const h = connect();
afterAll(() => h.close());
const today = todayIn("UTC");

describe("knowledge and reading", () => {
  it("turns a negotiation book into a practice task and a sales journal entry", async () => {
    const o = await h.newOwner();
    const book = await h.as(o.userId, (tx) =>
      createResource(tx, resourceCreateSchema.parse({ kind: "book", title: "Never Split the Difference", author: "Chris Voss", category: "Negotiation", totalUnits: 288 })),
    );
    expect(book).toMatchObject({ status: "want", startedOn: null });

    // Logging reading starts the book and moves its progress.
    await h.as(o.userId, (tx) => logSession(tx, sessionSchema.parse({ minutes: 30, units: 25, resourceId: book.id, progressTo: 40 })));
    let detail = await h.as(o.userId, (tx) => getResource(tx, book.id));
    expect(detail.resource).toMatchObject({ status: "in_progress", startedOn: today, progressUnits: 40 });
    await expect(h.as(o.userId, (tx) => logSession(tx, sessionSchema.parse({ minutes: 5, resourceId: book.id, progressTo: 999 })))).rejects.toMatchObject({ code: "validation_failed" });

    const concept = await h.as(o.userId, (tx) => addConcept(tx, book.id, { concept: "Tactical empathy", explanation: "Label their emotions before making your point." }));
    const app = await h.as(o.userId, (tx) =>
      addApplication(tx, book.id, { description: "Label the buyer's concern before answering a price objection", conceptId: concept.id, createTask: true, journalEntryId: null }),
    );
    expect(app.status).toBe("practising");
    const [task] = await h.as(o.userId, (tx) => tx.select().from(tasks).where(eq(tasks.id, app.taskId!)));
    expect(task.title).toBe("Practise: Label the buyer's concern before answering a price objection");
    expect(task.plannedWeek).not.toBeNull();

    const entry = await h.as(o.userId, (tx) =>
      journalFromApplication(tx, app.id, { title: "Labelled a price objection", situation: "Too expensive for us", response: "It sounds like budget is tight this quarter", worked: true, lesson: "They opened up about timing" }),
    );
    const [j] = await h.as(o.userId, (tx) => tx.select().from(salesJournalEntries).where(eq(salesJournalEntries.id, entry.id)));
    expect(j).toMatchObject({ kind: "successful_response", worked: true, tags: ["from-reading"] });
    expect(j.lesson).toContain("From: Never Split the Difference (Chris Voss)");
    const done = await h.as(o.userId, (tx) => updateApplication(tx, app.id, { status: "done", result: "Two calls went past the objection" }));
    expect(done.appliedOn).toBe(today);

    detail = await h.as(o.userId, (tx) => getResource(tx, book.id));
    expect(detail.applications[0]).toMatchObject({ task: { id: task.id }, journal: { id: entry.id, worked: true } });

    // Concepts can go to the psychology lab for spaced review, once; used concepts can't be deleted.
    const psych = await h.as(o.userId, (tx) => promoteConcept(tx, concept.id, "negotiation_psychology"));
    const [p] = await h.as(o.userId, (tx) => tx.select().from(psychConcepts).where(eq(psychConcepts.id, psych.id)));
    expect(p).toMatchObject({ concept: "Tactical empathy", sourceTitle: "Never Split the Difference", sourceAuthor: "Chris Voss", evidenceLevel: "practitioner" });
    await expect(h.as(o.userId, (tx) => promoteConcept(tx, concept.id, "negotiation_psychology"))).rejects.toMatchObject({ code: "already_promoted" });
    await expect(h.as(o.userId, (tx) => deleteConcept(tx, concept.id))).rejects.toMatchObject({ code: "concept_in_use" });

    // Completing sets the date and full progress; no future dates.
    const completed = await h.as(o.userId, (tx) => updateResource(tx, book.id, { status: "completed", rating: 5 }));
    expect(completed).toMatchObject({ completedOn: today, progressUnits: 288 });
    await rejectsWith(h.as(o.userId, (tx) => updateResource(tx, book.id, { completedOn: addDays(today, 1) })), { detail: "occurred_in_future" });
    await expect(h.as(o.userId, (tx) => updateResource(tx, book.id, { startedOn: addDays(today, -1), completedOn: addDays(today, -3) }))).rejects.toBeTruthy();

    const ov = await h.as(o.userId, (tx) => getOverview(tx));
    expect(ov.applied).toEqual({ completed: 1, withAppliedLesson: 1 });
    expect((await h.as(o.userId, (tx) => listResources(tx, { kind: "book", q: "voss" }))).map((r) => r.title)).toEqual(["Never Split the Difference"]);

    const other = await h.newOwner();
    await expect(h.as(other.userId, (tx) => getResource(tx, book.id))).rejects.toMatchObject({ status: 404 });
    await expect(h.as(other.userId, (tx) => addApplication(tx, book.id, { description: "x", conceptId: null, createTask: false, journalEntryId: null }))).rejects.toMatchObject({ status: 404 });
  });

  it("tracks a reading goal and daily reading", async () => {
    const o = await h.newOwner();
    await h.as(o.userId, (tx) => setGoal(tx, { year: Number(today.slice(0, 4)), targetCount: 12, kinds: ["book", "paper"], dailyMinutes: 20 }));
    await h.as(o.userId, (tx) => logSession(tx, sessionSchema.parse({ minutes: 25, readOn: addDays(today, -2) })));
    await h.as(o.userId, (tx) => logSession(tx, sessionSchema.parse({ minutes: 20, readOn: addDays(today, -1) })));
    await h.as(o.userId, (tx) => logSession(tx, sessionSchema.parse({ minutes: 10 })));
    await rejectsWith(h.as(o.userId, (tx) => logSession(tx, sessionSchema.parse({ minutes: 10, readOn: addDays(today, 1) }))), { detail: "occurred_in_future" });
    await h.as(o.userId, (tx) => createResource(tx, resourceCreateSchema.parse({ kind: "paper", title: "Anchoring revisited", status: "completed", completedOn: today })));
    await h.as(o.userId, (tx) => createResource(tx, resourceCreateSchema.parse({ kind: "podcast", title: "Sales podcast", status: "completed" })));
    const r = await h.as(o.userId, (tx) => getReading(tx));
    expect(r.stats).toMatchObject({ todayMinutes: 10, target: 20, targetMet: false, streak: 2 });
    expect(r.progress).toMatchObject({ completed: 1, target: 12 });
  });
});
