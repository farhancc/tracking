/**
 * Knowledge service: resources, concepts, applications linked to tasks and
 * the sales journal, reading goals and the daily reading log.
 */
import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import type { Tx } from "@/db/drizzle";
import { knowledgeApplications, knowledgeConcepts, knowledgeResources, readingGoals, readingSessions, salesJournalEntries, tasks } from "@/db/schema";
import { requireWorkspace } from "@/features/goals/server/service";
import { createConcept as createPsychConcept } from "@/features/psychology/server/service";
import { createJournalEntry } from "@/features/sales/server/service";
import { addDays, startOfWeek } from "@/lib/domain/dates";
import { goalProgress, PSYCH_SOURCE_TYPE, readingStats, type ResourceKind } from "@/lib/domain/knowledge";
import type { PsychCategory } from "@/lib/domain/psychology";
import { AppError, notFound } from "@/lib/errors";
import type { ResourceCreateInput, ResourceQuery, ResourceUpdateInput, SessionInput } from "../schemas";

export type ResourceRow = typeof knowledgeResources.$inferSelect;

async function findResource(tx: Tx, id: string): Promise<ResourceRow> {
  const [r] = await tx.select().from(knowledgeResources).where(eq(knowledgeResources.id, id)).limit(1);
  if (!r) throw notFound("Resource");
  return r;
}

/** Status ⇄ dates: starting sets a start date, completing sets a completion date (today unless given). */
function applyStatus<T extends Partial<ResourceRow>>(r: T, today: string): T {
  const out = { ...r };
  if (out.status && out.status !== "want" && !out.startedOn) out.startedOn = out.completedOn && out.completedOn < today ? out.completedOn : today;
  if (out.status === "completed") {
    out.completedOn = out.completedOn ?? today;
    if (out.totalUnits) out.progressUnits = out.totalUnits;
  } else if (out.status) out.completedOn = null;
  if (out.status === "want") out.startedOn = null;
  return out;
}

export async function createResource(tx: Tx, input: ResourceCreateInput) {
  const ws = await requireWorkspace(tx);
  const [row] = await tx.insert(knowledgeResources).values(applyStatus(input, ws.today)).returning();
  return row;
}

const READ_ONLY = new Set(["id", "userId", "createdAt", "updatedAt", "archivedAt"]);

export async function updateResource(tx: Tx, id: string, patch: ResourceUpdateInput) {
  const ws = await requireWorkspace(tx);
  const current = await findResource(tx, id);
  const { archived, ...rest } = patch;
  const merged = applyStatus({ ...current, ...rest }, ws.today);
  const writable = Object.fromEntries(Object.entries(merged).filter(([k]) => !READ_ONLY.has(k))) as Partial<ResourceRow>;
  const [row] = await tx
    .update(knowledgeResources)
    .set({ ...writable, ...(archived !== undefined ? { archivedAt: archived ? new Date() : null } : {}) })
    .where(eq(knowledgeResources.id, id))
    .returning();
  return row;
}

export async function listResources(tx: Tx, q: ResourceQuery) {
  const where: SQL[] = [isNull(knowledgeResources.archivedAt)];
  if (q.kind) where.push(eq(knowledgeResources.kind, q.kind));
  if (q.status) where.push(eq(knowledgeResources.status, q.status));
  if (q.category) where.push(eq(knowledgeResources.category, q.category));
  if (q.q) {
    const like = `%${q.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    where.push(or(ilike(knowledgeResources.title, like), ilike(knowledgeResources.author, like), ilike(knowledgeResources.notes, like))!);
  }
  const rows = await tx
    .select()
    .from(knowledgeResources)
    .where(and(...where))
    .orderBy(sql`case ${knowledgeResources.status} when 'in_progress' then 0 when 'want' then 1 when 'completed' then 2 else 3 end`, desc(knowledgeResources.updatedAt));
  const ids = rows.map((r) => r.id);
  const apps = ids.length
    ? await tx
        .select({ resourceId: knowledgeApplications.resourceId, status: knowledgeApplications.status, n: count() })
        .from(knowledgeApplications)
        .where(inArray(knowledgeApplications.resourceId, ids))
        .groupBy(knowledgeApplications.resourceId, knowledgeApplications.status)
    : [];
  const concepts = ids.length
    ? await tx.select({ resourceId: knowledgeConcepts.resourceId, n: count() }).from(knowledgeConcepts).where(inArray(knowledgeConcepts.resourceId, ids)).groupBy(knowledgeConcepts.resourceId)
    : [];
  return rows.map((r) => ({
    ...r,
    concepts: concepts.find((c) => c.resourceId === r.id)?.n ?? 0,
    applications: apps.filter((a) => a.resourceId === r.id).reduce((a, x) => a + x.n, 0),
    applied: apps.filter((a) => a.resourceId === r.id && a.status === "done").reduce((a, x) => a + x.n, 0),
  }));
}

export async function getResource(tx: Tx, id: string) {
  const ws = await requireWorkspace(tx);
  const resource = await findResource(tx, id);
  const concepts = await tx.select().from(knowledgeConcepts).where(eq(knowledgeConcepts.resourceId, id)).orderBy(asc(knowledgeConcepts.createdAt));
  const applications = await tx
    .select({
      application: knowledgeApplications,
      task: { id: tasks.id, title: tasks.title, status: tasks.status, plannedWeek: tasks.plannedWeek, scheduledOn: tasks.scheduledOn },
      journal: { id: salesJournalEntries.id, title: salesJournalEntries.title, kind: salesJournalEntries.kind, occurredOn: salesJournalEntries.occurredOn, worked: salesJournalEntries.worked },
    })
    .from(knowledgeApplications)
    .leftJoin(tasks, eq(tasks.id, knowledgeApplications.taskId))
    .leftJoin(salesJournalEntries, eq(salesJournalEntries.id, knowledgeApplications.journalEntryId))
    .where(eq(knowledgeApplications.resourceId, id))
    .orderBy(asc(knowledgeApplications.createdAt));
  const sessions = await tx.select().from(readingSessions).where(eq(readingSessions.resourceId, id)).orderBy(desc(readingSessions.readOn), desc(readingSessions.createdAt)).limit(100);
  const journal = await tx
    .select({ id: salesJournalEntries.id, title: salesJournalEntries.title, occurredOn: salesJournalEntries.occurredOn })
    .from(salesJournalEntries)
    .orderBy(desc(salesJournalEntries.occurredOn))
    .limit(50);
  return {
    today: ws.today,
    resource,
    concepts,
    applications: applications.map((a) => ({ ...a.application, task: a.task?.id ? a.task : null, journal: a.journal?.id ? a.journal : null })),
    sessions,
    minutesRead: sessions.reduce((a, s) => a + s.minutes, 0),
    recentJournal: journal,
  };
}

// ---------------------------------------------------------------------------
// Concepts

export async function addConcept(tx: Tx, resourceId: string, input: { concept: string; explanation: string | null }) {
  await findResource(tx, resourceId);
  const [row] = await tx.insert(knowledgeConcepts).values({ ...input, resourceId }).returning();
  return row;
}

export async function deleteConcept(tx: Tx, id: string) {
  const [used] = await tx.select({ n: count() }).from(knowledgeApplications).where(eq(knowledgeApplications.conceptId, id));
  if (used.n) throw new AppError(409, "concept_in_use", "An application uses this concept. Remove the application first.");
  const [row] = await tx.delete(knowledgeConcepts).where(eq(knowledgeConcepts.id, id)).returning();
  if (!row) throw notFound("Concept");
}

/** Copies a concept into the sales psychology lab (with the resource as its source) for spaced review. */
export async function promoteConcept(tx: Tx, id: string, category: PsychCategory) {
  const [c] = await tx.select().from(knowledgeConcepts).where(eq(knowledgeConcepts.id, id)).limit(1);
  if (!c) throw notFound("Concept");
  if (c.psychConceptId) throw new AppError(409, "already_promoted", "This concept is already in the psychology lab.");
  const r = await findResource(tx, c.resourceId);
  const psych = await createPsychConcept(tx, {
    category,
    concept: c.concept,
    explanation: c.explanation ?? `From ${r.title}${r.author ? ` by ${r.author}` : ""}.`,
    sourceTitle: r.title,
    sourceAuthor: r.author,
    sourceUrl: r.url,
    sourceType: PSYCH_SOURCE_TYPE[r.kind as ResourceKind],
    // Unknown strength until checked: never claim it is established science.
    evidenceLevel: r.kind === "paper" ? "limited" : "practitioner",
    evidenceNotes: null,
    example: null,
    ethics: null,
    whereToApply: null,
    observations: null,
    takeaways: null,
    understanding: "new",
    learnedOn: null,
  });
  await tx.update(knowledgeConcepts).set({ psychConceptId: psych.id }).where(eq(knowledgeConcepts.id, id));
  return psych;
}

// ---------------------------------------------------------------------------
// Applications: knowledge → real-world practice

export async function addApplication(
  tx: Tx,
  resourceId: string,
  input: { description: string; conceptId: string | null; createTask: boolean; journalEntryId: string | null },
) {
  const ws = await requireWorkspace(tx);
  const r = await findResource(tx, resourceId);
  let taskId: string | null = null;
  if (input.createTask) {
    const [task] = await tx
      .insert(tasks)
      .values({
        title: `Practise: ${input.description}`.slice(0, 300),
        notes: `From “${r.title}”${r.author ? ` by ${r.author}` : ""}.`,
        plannedWeek: startOfWeek(ws.today, ws.profile?.weekStartsOn ?? 1),
        goalId: r.goalId,
      })
      .returning();
    taskId = task.id;
  }
  const [row] = await tx
    .insert(knowledgeApplications)
    .values({ resourceId, description: input.description, conceptId: input.conceptId, journalEntryId: input.journalEntryId, taskId, status: taskId ? "practising" : "planned" })
    .returning();
  return row;
}

export async function updateApplication(
  tx: Tx,
  id: string,
  patch: { description?: string; status?: (typeof knowledgeApplications.$inferSelect)["status"]; result?: string | null; appliedOn?: string | null; journalEntryId?: string | null },
) {
  const ws = await requireWorkspace(tx);
  const set = { ...patch };
  if (set.status === "done" && !set.appliedOn) {
    const [cur] = await tx.select({ appliedOn: knowledgeApplications.appliedOn }).from(knowledgeApplications).where(eq(knowledgeApplications.id, id)).limit(1);
    set.appliedOn = cur?.appliedOn ?? ws.today;
  }
  const [row] = await tx.update(knowledgeApplications).set(set).where(eq(knowledgeApplications.id, id)).returning();
  if (!row) throw notFound("Application");
  return row;
}

/** Writes the experience into the sales performance journal (as a lesson) and links it. */
export async function journalFromApplication(
  tx: Tx,
  id: string,
  input: { title: string; situation: string | null; response: string | null; worked: boolean | null; lesson: string | null },
) {
  const [app] = await tx.select().from(knowledgeApplications).where(eq(knowledgeApplications.id, id)).limit(1);
  if (!app) throw notFound("Application");
  const r = await findResource(tx, app.resourceId);
  const entry = await createJournalEntry(tx, {
    kind: input.worked === true ? "successful_response" : "lesson",
    title: input.title,
    occurredOn: null,
    trackId: null,
    prospectId: null,
    situation: input.situation,
    response: input.response,
    worked: input.worked,
    lesson: input.lesson ? `${input.lesson}\n\nFrom: ${r.title}${r.author ? ` (${r.author})` : ""}` : `From: ${r.title}${r.author ? ` (${r.author})` : ""}`,
    tags: ["from-reading"],
  });
  await tx.update(knowledgeApplications).set({ journalEntryId: entry.id }).where(eq(knowledgeApplications.id, id));
  return entry;
}

export async function deleteApplication(tx: Tx, id: string) {
  const [row] = await tx.delete(knowledgeApplications).where(eq(knowledgeApplications.id, id)).returning();
  if (!row) throw notFound("Application");
}

// ---------------------------------------------------------------------------
// Reading goal and log

export async function setGoal(tx: Tx, input: { year: number; targetCount: number | null; kinds: string[]; dailyMinutes: number | null }) {
  const [row] = await tx
    .insert(readingGoals)
    .values(input)
    .onConflictDoUpdate({ target: [readingGoals.userId, readingGoals.year], set: { targetCount: input.targetCount, kinds: input.kinds, dailyMinutes: input.dailyMinutes } })
    .returning();
  return row;
}

export async function logSession(tx: Tx, input: SessionInput) {
  const ws = await requireWorkspace(tx);
  const { progressTo, ...values } = input;
  if (values.resourceId) {
    const r = await findResource(tx, values.resourceId);
    const patch: ResourceUpdateInput = {};
    if (r.status === "want") patch.status = "in_progress";
    if (progressTo != null) {
      if (r.totalUnits && progressTo > r.totalUnits) {
        throw new AppError(422, "validation_failed", `This ${r.kind} has ${r.totalUnits} in total.`, { progressTo: [`At most ${r.totalUnits}.`] });
      }
      patch.progressUnits = progressTo;
    }
    if (Object.keys(patch).length) await updateResource(tx, r.id, patch);
  }
  const [row] = await tx.insert(readingSessions).values({ ...values, readOn: values.readOn ?? ws.today }).returning();
  return row;
}

export async function deleteSession(tx: Tx, id: string) {
  const [row] = await tx.delete(readingSessions).where(eq(readingSessions.id, id)).returning();
  if (!row) throw notFound("Reading session");
}

export async function getReading(tx: Tx) {
  const ws = await requireWorkspace(tx);
  const year = Number(ws.today.slice(0, 4));
  const [goal] = await tx.select().from(readingGoals).where(eq(readingGoals.year, year)).limit(1);
  const sessions = await tx
    .select({ id: readingSessions.id, readOn: readingSessions.readOn, minutes: readingSessions.minutes, units: readingSessions.units, note: readingSessions.note, resourceId: readingSessions.resourceId, title: knowledgeResources.title })
    .from(readingSessions)
    .leftJoin(knowledgeResources, eq(knowledgeResources.id, readingSessions.resourceId))
    .where(gte(readingSessions.readOn, addDays(ws.today, -400)))
    .orderBy(desc(readingSessions.readOn), desc(readingSessions.id));
  const kinds = (goal?.kinds ?? ["book"]) as ResourceKind[];
  const [{ n: completedThisYear }] = await tx
    .select({ n: count() })
    .from(knowledgeResources)
    .where(and(eq(knowledgeResources.status, "completed"), gte(knowledgeResources.completedOn, `${year}-01-01`), inArray(knowledgeResources.kind, kinds), isNull(knowledgeResources.archivedAt)));
  return {
    today: ws.today,
    year,
    goal: goal ?? null,
    stats: readingStats(sessions, goal?.dailyMinutes ?? null, ws.today),
    progress: goalProgress(completedThisYear, goal?.targetCount ?? null, ws.today),
    recent: sessions.slice(0, 20),
  };
}

export async function getOverview(tx: Tx) {
  const reading = await getReading(tx);
  const resources = await listResources(tx, {});
  const [{ n: practising }] = await tx.select({ n: count() }).from(knowledgeApplications).where(eq(knowledgeApplications.status, "practising"));
  const completed = resources.filter((r) => r.status === "completed");
  return {
    ...reading,
    resources,
    categories: [...new Set(resources.map((r) => r.category).filter((c): c is string => !!c))].sort(),
    practising,
    applied: { completed: completed.length, withAppliedLesson: completed.filter((r) => r.applied > 0).length },
  };
}
