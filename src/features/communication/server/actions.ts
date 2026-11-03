"use server";

import type { Tx } from "@/db/client";
import { formNullable, formNullableNumber, formNumber, formText, runAction, runSimpleAction, type ActionState } from "@/lib/server-action";
import { assessmentCreateSchema, exerciseCreateSchema, practiceCreateSchema, resourceCreateSchema, skillUpdateSchema } from "../schemas";
import * as service from "./service";

const run = (fn: (tx: Tx) => Promise<unknown>, success?: string) => runAction(fn, { success });
const simple = (fn: (tx: Tx) => Promise<unknown>) => runSimpleAction(fn);

const words = (fd: FormData) =>
  (formText(fd, "words") ?? "")
    .split(/[,\n]/)
    .map((w) => w.trim())
    .filter(Boolean);

export async function logPracticeAction(defaults: { exerciseId?: string; skillId?: string }, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async (tx) => {
    await service.logPractice(
      tx,
      practiceCreateSchema.parse({
        exerciseId: formNullable(fd, "exerciseId") ?? defaults.exerciseId ?? null,
        skillId: formNullable(fd, "skillId") ?? defaults.skillId ?? null,
        practicedOn: formNullable(fd, "practicedOn"),
        durationMinutes: formNullableNumber(fd, "durationMinutes"),
        selfRating: formNullableNumber(fd, "selfRating"),
        content: formNullable(fd, "content"),
        notes: formNullable(fd, "notes"),
        words: words(fd),
        recordingId: formNullable(fd, "recordingId"),
      }),
    );
  }, "Practice logged. It counts towards your history, not your level: assess to update the level.");
}

export async function deletePracticeAction(id: string): Promise<void> {
  await simple((tx) => service.deletePractice(tx, id));
}

export async function addAssessmentAction(skillId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async (tx) => {
    await service.addAssessment(
      tx,
      assessmentCreateSchema.parse({
        skillId,
        level: formNumber(fd, "level"),
        method: formText(fd, "method"),
        assessor: formNullable(fd, "assessor"),
        evidence: formText(fd, "evidence") ?? "",
        recordingId: formNullable(fd, "recordingId"),
        assessedOn: formNullable(fd, "assessedOn"),
        notes: formNullable(fd, "notes"),
      }),
    );
  }, "Assessment saved.");
}

export async function updateSkillTargetAction(skillId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async (tx) => {
    await service.updateSkill(tx, skillId, skillUpdateSchema.parse({ targetLevel: formNumber(fd, "targetLevel") }));
  });
}

export async function addExerciseAction(skillId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async (tx) => {
    await service.addExercise(
      tx,
      exerciseCreateSchema.parse({
        skillId,
        title: formText(fd, "title"),
        instructions: formNullable(fd, "instructions"),
        durationMinutes: formNullableNumber(fd, "durationMinutes"),
      }),
    );
  }, "Exercise added.");
}

export async function addResourceAction(skillId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async (tx) => {
    await service.addResource(
      tx,
      resourceCreateSchema.parse({ skillId, kind: formText(fd, "kind"), title: formText(fd, "title"), url: formNullable(fd, "url"), notes: formNullable(fd, "notes") }),
    );
  }, "Resource added.");
}

export async function deleteResourceAction(id: string): Promise<void> {
  await simple((tx) => service.deleteResource(tx, id));
}
