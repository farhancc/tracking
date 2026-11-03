"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { withUser, type Tx } from "@/db/client";
import { requireUser } from "@/lib/auth/current-user";
import { toAppError } from "@/lib/errors";
import {
  dependencyCreateSchema,
  goalCreateSchema,
  goalUpdateSchema,
  journeyCreateSchema,
  linkCreateSchema,
  measurementCreateSchema,
  taskCreateSchema,
  taskUpdateSchema,
  visionSaveSchema,
} from "../schemas";
import * as service from "./service";

export type ActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
} | null;

/**
 * Every action: authenticate, run inside withUser() (RLS), map errors to a
 * form-friendly state, and re-render the goal pages on success.
 */
async function run(fn: (tx: Tx) => Promise<unknown>, success?: string): Promise<ActionState> {
  try {
    const { userId } = await requireUser();
    await withUser(userId, fn);
  } catch (e) {
    unstable_rethrow(e); // let redirect()/notFound() through
    const err = toAppError(e);
    return { ok: false, message: err.message, fieldErrors: err.fieldErrors };
  }
  revalidatePath("/goals", "layout");
  return { ok: true, message: success };
}

// --- FormData helpers -------------------------------------------------------

function text(fd: FormData, key: string): string | undefined {
  const v = fd.get(key);
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  return trimmed === "" ? undefined : trimmed;
}

function nullableText(fd: FormData, key: string): string | null {
  return text(fd, key) ?? null;
}

function num(fd: FormData, key: string): number | undefined {
  const v = text(fd, key);
  if (v === undefined) return undefined;
  const n = Number(v.replace(/,/g, ""));
  return Number.isNaN(n) ? Number.NaN : n;
}

function goalFromForm(fd: FormData) {
  return {
    title: text(fd, "title"),
    description: nullableText(fd, "description"),
    pillarId: text(fd, "pillarId"),
    level: text(fd, "level"),
    category: nullableText(fd, "category"),
    parentId: nullableText(fd, "parentId"),
    startDate: text(fd, "startDate"),
    targetDate: text(fd, "targetDate"),
    priority: num(fd, "priority"),
    status: text(fd, "status"),
    successMetric: text(fd, "successMetric"),
    unit: text(fd, "unit"),
    currency: nullableText(fd, "currency"),
    measurementMode: text(fd, "measurementMode"),
    baselineValue: num(fd, "baselineValue"),
    targetValue: num(fd, "targetValue"),
    notes: nullableText(fd, "notes"),
  };
}

// --- Journey & vision -------------------------------------------------------

export async function createJourneyAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async (tx) => {
    await service.createJourney(
      tx,
      journeyCreateSchema.parse({
        name: text(fd, "name"),
        startDate: text(fd, "startDate"),
        timezone: text(fd, "timezone"),
        baseCurrency: text(fd, "baseCurrency"),
        weekStartsOn: num(fd, "weekStartsOn"),
        displayName: nullableText(fd, "displayName"),
      }),
    );
  }, "Your five-year journey has started.");
}

export async function saveVisionAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async (tx) => {
    await service.saveVision(
      tx,
      visionSaveSchema.parse({
        title: text(fd, "title"),
        statement: text(fd, "statement"),
        professionalIdentity: nullableText(fd, "professionalIdentity"),
        exitStrategy: nullableText(fd, "exitStrategy"),
      }),
    );
  }, "Saved as a new vision version.");
}

// --- Goals ------------------------------------------------------------------

export async function createGoalAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  let createdId: string | undefined;
  const state = await run(async (tx) => {
    const goal = await service.createGoal(tx, goalCreateSchema.parse(goalFromForm(fd)));
    createdId = goal.id;
  });
  if (state?.ok && createdId) redirect(`/goals/${createdId}`);
  return state;
}

export async function updateGoalAction(goalId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const state = await run(async (tx) => {
    const raw = goalFromForm(fd);
    await service.updateGoal(tx, goalId, goalUpdateSchema.parse(raw));
  });
  if (state?.ok) redirect(`/goals/${goalId}`);
  return state;
}

export async function setGoalStatusAction(goalId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async (tx) => {
    await service.updateGoal(tx, goalId, goalUpdateSchema.parse({ status: text(fd, "status") }));
  }, "Status updated.");
}

export async function archiveGoalAction(goalId: string, parentId: string | null): Promise<void> {
  const { userId } = await requireUser();
  await withUser(userId, (tx) => service.archiveGoal(tx, goalId));
  revalidatePath("/goals", "layout");
  redirect(parentId ? `/goals/${parentId}` : "/goals");
}

export async function restoreGoalAction(goalId: string): Promise<void> {
  const { userId } = await requireUser();
  await withUser(userId, (tx) => service.restoreGoal(tx, goalId));
  revalidatePath("/goals", "layout");
}

// --- Measurements -----------------------------------------------------------

export async function addMeasurementAction(goalId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async (tx) => {
    await service.addMeasurement(
      tx,
      goalId,
      measurementCreateSchema.parse({
        measuredOn: text(fd, "measuredOn"),
        value: num(fd, "value"),
        note: nullableText(fd, "note"),
      }),
    );
  }, "Measurement logged.");
}

export async function deleteMeasurementAction(goalId: string, measurementId: string): Promise<void> {
  const { userId } = await requireUser();
  await withUser(userId, (tx) => service.deleteMeasurement(tx, goalId, measurementId));
  revalidatePath("/goals", "layout");
}

// --- Dependencies & links ---------------------------------------------------

export async function addDependencyAction(goalId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async (tx) => {
    await service.addDependency(
      tx,
      goalId,
      dependencyCreateSchema.parse({
        dependsOnGoalId: text(fd, "dependsOnGoalId"),
        isBlocking: fd.get("isBlocking") === "on",
        note: nullableText(fd, "note"),
      }),
    );
  }, "Dependency added.");
}

export async function removeDependencyAction(goalId: string, dependsOnGoalId: string): Promise<void> {
  const { userId } = await requireUser();
  await withUser(userId, (tx) => service.removeDependency(tx, goalId, dependsOnGoalId));
  revalidatePath("/goals", "layout");
}

export async function addLinkAction(goalId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async (tx) => {
    await service.addLink(
      tx,
      goalId,
      linkCreateSchema.parse({
        relatedGoalId: text(fd, "relatedGoalId"),
        kind: text(fd, "kind"),
        note: nullableText(fd, "note"),
      }),
    );
  }, "Related goal added.");
}

export async function removeLinkAction(goalId: string, relatedGoalId: string): Promise<void> {
  const { userId } = await requireUser();
  await withUser(userId, (tx) => service.removeLink(tx, goalId, relatedGoalId));
  revalidatePath("/goals", "layout");
}

// --- Tasks ------------------------------------------------------------------

export async function createTaskAction(goalId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async (tx) => {
    await service.createTask(
      tx,
      taskCreateSchema.parse({ title: text(fd, "title"), goalId, dueOn: nullableText(fd, "dueOn") }),
    );
  }, "Task added.");
}

export async function setTaskStatusAction(taskId: string, status: string): Promise<void> {
  const { userId } = await requireUser();
  await withUser(userId, (tx) => service.updateTask(tx, taskId, taskUpdateSchema.parse({ status })));
  revalidatePath("/goals", "layout");
}
