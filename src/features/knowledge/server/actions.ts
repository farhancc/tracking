"use server";

import { redirect } from "next/navigation";
import type { Tx } from "@/db/client";
import { formObject, runAction, runSimpleAction, type ActionState } from "@/lib/server-action";
import {
  applicationCreateSchema,
  applicationUpdateSchema,
  conceptSchema,
  goalSchema,
  journalFromApplicationSchema,
  promoteSchema,
  resourceCreateSchema,
  resourceUpdateSchema,
  sessionSchema,
} from "../schemas";
import * as service from "./service";

const run = (fn: (tx: Tx) => Promise<unknown>, success?: string) => runAction(fn, { success });

export async function createResourceAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  let id: string | undefined;
  const state = await run(async (tx) => {
    id = (await service.createResource(tx, resourceCreateSchema.parse(formObject(fd)))).id;
  });
  if (state?.ok && id) redirect(`/knowledge/${id}`);
  return state;
}

export async function updateResourceAction(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async (tx) => {
    const raw = formObject(fd, "null");
    for (const k of ["kind", "title", "status"]) if (raw[k] === null) delete raw[k];
    await service.updateResource(tx, id, resourceUpdateSchema.parse(raw));
  }, "Saved.");
}

export async function setResourceStatusAction(id: string, fd: FormData): Promise<void> {
  await runSimpleAction((tx) => service.updateResource(tx, id, resourceUpdateSchema.parse(formObject(fd))));
}

export async function archiveResourceAction(id: string): Promise<void> {
  await runSimpleAction((tx) => service.updateResource(tx, id, { archived: true }));
  redirect("/knowledge");
}

export async function addConceptAction(resourceId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run((tx) => service.addConcept(tx, resourceId, conceptSchema.parse(formObject(fd))), "Concept added.");
}

export async function deleteConceptAction(id: string): Promise<ActionState> {
  return run((tx) => service.deleteConcept(tx, id));
}

export async function promoteConceptAction(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run((tx) => service.promoteConcept(tx, id, promoteSchema.parse(formObject(fd)).category), "Added to the psychology lab.");
}

export async function addApplicationAction(resourceId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run((tx) => service.addApplication(tx, resourceId, applicationCreateSchema.parse(formObject(fd))), "Saved.");
}

export async function updateApplicationAction(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run((tx) => service.updateApplication(tx, id, applicationUpdateSchema.parse(formObject(fd, "null"))), "Saved.");
}

export async function journalFromApplicationAction(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run((tx) => service.journalFromApplication(tx, id, journalFromApplicationSchema.parse(formObject(fd))), "Written to the sales journal.");
}

export async function deleteApplicationAction(id: string): Promise<void> {
  await runSimpleAction((tx) => service.deleteApplication(tx, id));
}

export async function setGoalAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return run((tx) => service.setGoal(tx, goalSchema.parse({ ...formObject(fd), kinds: fd.getAll("kinds").map(String) })), "Goal saved.");
}

export async function logSessionAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return run((tx) => service.logSession(tx, sessionSchema.parse(formObject(fd))), "Reading logged.");
}

export async function deleteSessionAction(id: string): Promise<void> {
  await runSimpleAction((tx) => service.deleteSession(tx, id));
}
