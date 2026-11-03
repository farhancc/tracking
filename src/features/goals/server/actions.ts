"use server";

import { redirect } from "next/navigation";
import {
  formCheckbox,
  formNullable as nullableText,
  formNullableNumber,
  formNumber as num,
  formText as text,
  runAction,
  runSimpleAction,
  type ActionState,
} from "@/lib/server-action";
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
import type { Tx } from "@/db/client";

export type { ActionState };

const run = (fn: (tx: Tx) => Promise<unknown>, success?: string) => runAction(fn, { success });
const simple = (fn: (tx: Tx) => Promise<unknown>) => runSimpleAction(fn);

function goalFromForm(fd: FormData) {
  return {
    title: text(fd, "title"),
    description: nullableText(fd, "description"),
    pillarId: text(fd, "pillarId"),
    level: text(fd, "level"),
    category: nullableText(fd, "category"),
    parentId: nullableText(fd, "parentId"),
    isKeyResult: formCheckbox(fd, "isKeyResult"),
    focusArea: nullableText(fd, "focusArea"),
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
    estimatedHours: formNullableNumber(fd, "estimatedHours"),
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
  await simple((tx) => service.archiveGoal(tx, goalId));
  redirect(parentId ? `/goals/${parentId}` : "/goals");
}

export async function restoreGoalAction(goalId: string): Promise<void> {
  await simple((tx) => service.restoreGoal(tx, goalId));
}

/** Adds a key result to an objective, inheriting its level, period and pillar. */
export async function addKeyResultAction(objectiveId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async (tx) => {
    const objective = await service.getGoal(tx, objectiveId);
    await service.createGoal(
      tx,
      goalCreateSchema.parse({
        title: text(fd, "title"),
        level: objective.level,
        parentId: objective.id,
        isKeyResult: true,
        pillarId: objective.pillarId,
        startDate: objective.startDate,
        targetDate: objective.targetDate,
        priority: objective.priority,
        successMetric: text(fd, "successMetric") ?? text(fd, "title"),
        unit: text(fd, "unit"),
        currency: nullableText(fd, "currency"),
        measurementMode: text(fd, "measurementMode"),
        baselineValue: num(fd, "baselineValue"),
        targetValue: num(fd, "targetValue"),
      }),
    );
  }, "Key result added.");
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
  await simple((tx) => service.deleteMeasurement(tx, goalId, measurementId));
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
  await simple((tx) => service.removeDependency(tx, goalId, dependsOnGoalId));
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
  await simple((tx) => service.removeLink(tx, goalId, relatedGoalId));
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
  await simple((tx) => service.updateTask(tx, taskId, taskUpdateSchema.parse({ status })));
}
