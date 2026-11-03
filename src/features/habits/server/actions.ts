"use server";

import { redirect } from "next/navigation";
import type { Tx } from "@/db/client";
import type { CheckinStatus } from "@/lib/domain/habits";
import { formCheckbox, formNullable, formObject, runAction, runSimpleAction, type ActionState } from "@/lib/server-action";
import { habitCreateSchema, habitUpdateSchema, restDaySchema } from "../schemas";
import * as service from "./service";

const run = (fn: (tx: Tx) => Promise<unknown>, success?: string) => runAction(fn, { success });
const days = (fd: FormData) => fd.getAll("scheduleDays").map(String);

export async function checkInAction(habitId: string, day: string, status: CheckinStatus | null): Promise<void> {
  await runSimpleAction((tx) => service.checkIn(tx, habitId, { day, status, note: null }));
}

export async function skipWithReasonAction(habitId: string, day: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run((tx) => service.checkIn(tx, habitId, { day, status: "skipped", note: formNullable(fd, "note") }));
}

export async function createHabitAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return run((tx) => service.createHabit(tx, habitCreateSchema.parse({ ...formObject(fd), scheduleDays: days(fd).length ? days(fd) : undefined })), "Habit added.");
}

export async function updateHabitAction(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run((tx) => service.updateHabit(tx, id, habitUpdateSchema.parse({ ...formObject(fd), scheduleDays: days(fd).length ? days(fd) : undefined })), "Saved.");
}

export async function archiveHabitAction(id: string): Promise<void> {
  await runSimpleAction((tx) => service.updateHabit(tx, id, { archived: true }));
  redirect("/habits");
}

/** Deleting removes the history too, so it needs the confirmation box ticked. */
export async function deleteHabitAction(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  if (!formCheckbox(fd, "confirm")) return { ok: false, message: "Tick the box to confirm. Deleting also removes every check-in for this habit." };
  const state = await run((tx) => service.deleteHabit(tx, id));
  if (state?.ok) redirect("/habits");
  return state;
}

export async function addSuggestedAction(): Promise<void> {
  await runSimpleAction((tx) => service.addSuggestedHabits(tx));
}

export async function restDayAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return run((tx) => service.addRestDay(tx, restDaySchema.parse(formObject(fd))), "Rest day saved.");
}

export async function removeRestDayAction(id: string): Promise<void> {
  await runSimpleAction((tx) => service.removeRestDay(tx, id));
}
