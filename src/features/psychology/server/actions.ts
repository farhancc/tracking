"use server";

import { redirect } from "next/navigation";
import type { Tx } from "@/db/client";
import type { ReviewRating } from "@/lib/domain/psychology";
import { formNullable, formText, runAction, runSimpleAction, type ActionState } from "@/lib/server-action";
import { applicationCreateSchema, conceptCreateSchema, conceptUpdateSchema } from "../schemas";
import * as service from "./service";

const run = (fn: (tx: Tx) => Promise<unknown>, success?: string) => runAction(fn, { success });
const simple = (fn: (tx: Tx) => Promise<unknown>) => runSimpleAction(fn);

function conceptFromForm(fd: FormData) {
  return {
    category: formText(fd, "category"),
    concept: formText(fd, "concept"),
    explanation: formText(fd, "explanation"),
    sourceTitle: formNullable(fd, "sourceTitle"),
    sourceAuthor: formNullable(fd, "sourceAuthor"),
    sourceUrl: formNullable(fd, "sourceUrl"),
    sourceType: formText(fd, "sourceType"),
    evidenceLevel: formText(fd, "evidenceLevel"),
    evidenceNotes: formNullable(fd, "evidenceNotes"),
    example: formNullable(fd, "example"),
    ethics: formNullable(fd, "ethics"),
    whereToApply: formNullable(fd, "whereToApply"),
    observations: formNullable(fd, "observations"),
    takeaways: formNullable(fd, "takeaways"),
    learnedOn: formNullable(fd, "learnedOn"),
  };
}

export async function createConceptAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  let id: string | undefined;
  const state = await run(async (tx) => {
    id = (await service.createConcept(tx, conceptCreateSchema.parse(conceptFromForm(fd)))).id;
  });
  if (state?.ok && id) redirect(`/psychology/${id}`);
  return state;
}

export async function updateConceptAction(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async (tx) => {
    const raw = conceptFromForm(fd);
    await service.updateConcept(tx, id, conceptUpdateSchema.parse({ ...raw, learnedOn: raw.learnedOn ?? undefined }));
  }, "Saved.");
}

export async function setUnderstandingAction(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async (tx) => {
    await service.updateConcept(tx, id, conceptUpdateSchema.parse({ understanding: formText(fd, "understanding") }));
  }, "Understanding updated.");
}

export async function reviewAction(id: string, rating: ReviewRating): Promise<void> {
  await simple((tx) => service.reviewConcept(tx, id, rating));
}

export async function addApplicationAction(conceptId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async (tx) => {
    await service.addApplication(
      tx,
      conceptId,
      applicationCreateSchema.parse({
        appliedOn: formNullable(fd, "appliedOn"),
        context: formText(fd, "context"),
        action: formNullable(fd, "action"),
        result: formNullable(fd, "result"),
        outcome: formText(fd, "outcome"),
      }),
    );
  }, "Experiment logged.");
}

export async function deleteApplicationAction(id: string): Promise<void> {
  await simple((tx) => service.deleteApplication(tx, id));
}

export async function archiveConceptAction(id: string): Promise<void> {
  await simple((tx) => service.updateConcept(tx, id, { archived: true }));
  redirect("/psychology");
}
