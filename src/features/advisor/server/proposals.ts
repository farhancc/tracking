/**
 * Changes the advisor proposed. Nothing is applied until the user confirms;
 * a failed change is recorded as failed and leaves the data as it was.
 */
import { and, desc, eq } from "drizzle-orm";
import type { Tx } from "@/db/drizzle";
import { advisorProposals, tasks } from "@/db/schema";
import { goalUpdateSchema, taskCreateSchema } from "@/features/goals/schemas";
import { archiveGoal, createTask, updateGoal } from "@/features/goals/server/service";
import { AppError, notFound, toAppError } from "@/lib/errors";

export async function listProposals(tx: Tx, status?: "pending") {
  return tx
    .select()
    .from(advisorProposals)
    .where(status ? eq(advisorProposals.status, status) : undefined)
    .orderBy(desc(advisorProposals.createdAt))
    .limit(50);
}

async function apply(tx: Tx, p: typeof advisorProposals.$inferSelect) {
  const payload = p.payload as Record<string, unknown>;
  switch (p.kind) {
    case "update_goal":
      await updateGoal(tx, String(payload.goalId), goalUpdateSchema.parse(payload.changes));
      return "Goal updated.";
    case "archive_goal": {
      const r = await archiveGoal(tx, String(payload.goalId));
      return `Archived ${r.archived} goal(s).`;
    }
    case "create_task":
      await createTask(tx, taskCreateSchema.parse({ title: payload.title, goalId: payload.goalId, plannedWeek: payload.plannedWeek }));
      return "Task added.";
    case "delete_task": {
      const [d] = await tx.delete(tasks).where(eq(tasks.id, String(payload.taskId))).returning({ id: tasks.id });
      if (!d) throw notFound("Task");
      return "Task deleted.";
    }
  }
}

export async function confirmProposal(tx: Tx, id: string) {
  const [p] = await tx.select().from(advisorProposals).where(and(eq(advisorProposals.id, id))).limit(1);
  if (!p) throw notFound("Proposal");
  if (p.status !== "pending") throw new AppError(409, "proposal_decided", `This proposal was already ${p.status}.`);
  let status: "confirmed" | "failed" = "confirmed";
  let result: string;
  try {
    // A savepoint, so a failed change rolls back on its own and can be recorded.
    result = await tx.transaction((sp) => apply(sp, p));
  } catch (e) {
    status = "failed";
    result = toAppError(e).message;
  }
  const [row] = await tx.update(advisorProposals).set({ status, result, decidedAt: new Date() }).where(eq(advisorProposals.id, id)).returning();
  return row;
}

export async function rejectProposal(tx: Tx, id: string) {
  const [p] = await tx.select().from(advisorProposals).where(eq(advisorProposals.id, id)).limit(1);
  if (!p) throw notFound("Proposal");
  if (p.status !== "pending") throw new AppError(409, "proposal_decided", `This proposal was already ${p.status}.`);
  const [row] = await tx.update(advisorProposals).set({ status: "rejected", decidedAt: new Date() }).where(eq(advisorProposals.id, id)).returning();
  return row;
}
