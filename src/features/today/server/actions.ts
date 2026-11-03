"use server";

import type { Tx } from "@/db/client";
import { parseMinutes } from "@/lib/domain/weekly";
import { AppError } from "@/lib/errors";
import { formCheckbox, formNullable, formText, runAction, runSimpleAction, type ActionState } from "@/lib/server-action";
import { habitCreateSchema, quickTaskSchema, reflectionSchema } from "../schemas";
import { updateTask } from "@/features/goals/server/service";
import * as service from "./service";

const run = (fn: (tx: Tx) => Promise<unknown>, success?: string) => runAction(fn, { success });
const simple = (fn: (tx: Tx) => Promise<unknown>) => runSimpleAction(fn);

export async function quickAddTaskAction(day: string, mitRank: number | null, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async (tx) => {
    await service.addTodayTask(
      tx,
      quickTaskSchema.parse({
        title: formText(fd, "title"),
        estimatedMinutes: parseMinutes(formText(fd, "estimatedMinutes")),
        scheduledStart: formNullable(fd, "scheduledStart"),
        goalId: formNullable(fd, "goalId"),
        mitRank,
        isDeliverable: formCheckbox(fd, "isDeliverable"),
      }),
      day,
    );
  }, "Added to today.");
}

export async function setMitAction(day: string, rank: number, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async (tx) => {
    const taskId = formText(fd, "taskId");
    if (!taskId) throw new AppError(400, "invalid_input", "Choose a task.");
    await service.setMit(tx, rank, taskId, day);
  });
}

export async function clearMitAction(day: string, rank: number): Promise<void> {
  await simple((tx) => service.setMit(tx, rank, null, day));
}

export async function startTaskAction(taskId: string): Promise<void> {
  await simple((tx) => service.startTask(tx, taskId));
}

export async function finishTaskAction(taskId: string): Promise<void> {
  await simple((tx) => service.finishTask(tx, taskId));
}

export async function reopenTaskAction(taskId: string): Promise<void> {
  await simple((tx) => updateTask(tx, taskId, { status: "todo" }));
}

export async function scheduleTodayAction(day: string, taskId: string): Promise<void> {
  await simple((tx) => service.scheduleForToday(tx, taskId, day));
}

export async function unscheduleAction(taskId: string): Promise<void> {
  await simple((tx) => service.unscheduleTask(tx, taskId));
}

export async function carryOverdueAction(day: string): Promise<void> {
  await simple((tx) => service.carryOverdueToToday(tx, day));
}

export async function saveAvailableTimeAction(day: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async (tx) => {
    const minutes = parseMinutes(formText(fd, "available"));
    if (minutes !== null && (Number.isNaN(minutes) || minutes < 0 || minutes > 1440)) {
      throw new AppError(400, "invalid_input", "Use a duration like 3h or 2h 30m.");
    }
    await service.saveDayPlan(tx, minutes, day);
  });
}

export async function saveReflectionAction(day: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async (tx) => {
    await service.saveReflection(
      tx,
      reflectionSchema.parse({
        accomplished: formNullable(fd, "accomplished"),
        learned: formNullable(fd, "learned"),
        wentWrong: formNullable(fd, "wentWrong"),
        improveTomorrow: formNullable(fd, "improveTomorrow"),
      }),
      day,
    );
  }, "Reflection saved.");
}

export async function checkInHabitAction(day: string, habitId: string, status: "done" | "skipped" | null): Promise<void> {
  await simple((tx) => service.checkInHabit(tx, habitId, status, day));
}

export async function createHabitAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async (tx) => {
    const days = fd.getAll("days").map((d) => Number(d));
    await service.createHabit(tx, habitCreateSchema.parse({ name: formText(fd, "name"), scheduleDays: days.length ? days : [0, 1, 2, 3, 4, 5, 6] }));
  }, "Habit added.");
}

