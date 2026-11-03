"use server";

import type { Tx } from "@/db/client";
import { taskCreateSchema, taskUpdateSchema } from "@/features/goals/schemas";
import * as goalService from "@/features/goals/server/service";
import {
  formCheckbox,
  formNullable,
  formNullableNumber,
  formNumber,
  formText,
  runAction,
  runSimpleAction,
  type ActionState,
} from "@/lib/server-action";
import { AppError } from "@/lib/errors";
import { parseMinutes } from "@/lib/domain/weekly";
import { weekPlanSchema, weekReviewSchema, weeklyGoalCreateSchema } from "../schemas";
import * as service from "./service";

const run = (fn: (tx: Tx) => Promise<unknown>, success?: string) => runAction(fn, { success });
const simple = (fn: (tx: Tx) => Promise<unknown>) => runSimpleAction(fn);

const minutes = (fd: FormData, key: string) => parseMinutes(formText(fd, key));

export async function saveWeekPlanAction(weekStart: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async (tx) => {
    await service.saveWeekPlan(tx, weekStart, weekPlanSchema.parse({ focus: formNullable(fd, "focus"), capacityHours: formNullableNumber(fd, "capacityHours") }));
  }, "Week saved.");
}

export async function createWeeklyGoalAction(weekStart: string, focusArea: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async (tx) => {
    await service.createWeeklyGoal(
      tx,
      weekStart,
      weeklyGoalCreateSchema.parse({
        focusArea,
        parentId: formText(fd, "parentId"),
        title: formText(fd, "title"),
        successMetric: formText(fd, "successMetric"),
        unit: formText(fd, "unit"),
        measurementMode: formText(fd, "measurementMode"),
        baselineValue: formNumber(fd, "baselineValue"),
        targetValue: formNumber(fd, "targetValue"),
        priority: formNumber(fd, "priority"),
      }),
    );
  }, "Weekly goal added.");
}

export async function addWeekTaskAction(weekStart: string, goalId: string | null, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async (tx) => {
    await goalService.createTask(
      tx,
      taskCreateSchema.parse({
        title: formText(fd, "title"),
        goalId,
        dueOn: formNullable(fd, "dueOn"),
        plannedWeek: weekStart,
        priority: formNumber(fd, "priority"),
        estimatedMinutes: minutes(fd, "estimatedMinutes"),
        isDeliverable: formCheckbox(fd, "isDeliverable"),
      }),
    );
  }, "Task added.");
}

export async function toggleTaskAction(taskId: string, done: boolean): Promise<void> {
  await simple((tx) => goalService.updateTask(tx, taskId, taskUpdateSchema.parse({ status: done ? "done" : "todo" })));
}

export async function logTaskTimeAction(taskId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async (tx) => {
    await goalService.updateTask(tx, taskId, taskUpdateSchema.parse({ actualMinutes: minutes(fd, "actualMinutes") }));
  });
}

export async function cancelTaskAction(taskId: string): Promise<void> {
  await simple((tx) => goalService.updateTask(tx, taskId, taskUpdateSchema.parse({ status: "cancelled" })));
}

export async function carryForwardAction(taskId: string, toWeek: string): Promise<void> {
  await simple((tx) => service.carryForward(tx, taskId, { toWeek }));
}

export async function carryAllAction(toWeek: string): Promise<void> {
  await simple((tx) => service.carryForwardAll(tx, toWeek));
}

export async function rescheduleTaskAction(taskId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async (tx) => {
    const dueOn = formText(fd, "dueOn");
    if (!dueOn) throw new AppError(400, "invalid_input", "Pick a date.");
    await service.rescheduleTask(tx, taskId, dueOn);
  }, "Rescheduled.");
}

export async function reviewWeekAction(weekStart: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async (tx) => {
    await service.reviewWeek(
      tx,
      weekStart,
      weekReviewSchema.parse({ wins: formNullable(fd, "wins"), lessons: formNullable(fd, "lessons"), notes: formNullable(fd, "notes") }),
    );
  }, "Week reviewed. The scorecard is saved as it stands.");
}
