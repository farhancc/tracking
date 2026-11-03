"use server";

import { redirect } from "next/navigation";
import type { Tx } from "@/db/client";
import { formObject, runAction, runSimpleAction, type ActionState } from "@/lib/server-action";
import { brandSchema, itemCreateSchema, itemUpdateSchema, metricSchema, pillarCreateSchema, pillarUpdateSchema, repurposeSchema, sourceSchema, type MetricInput } from "../schemas";
import * as service from "./service";

const run = (fn: (tx: Tx) => Promise<unknown>, success?: string) => runAction(fn, { success });

export async function saveBrandAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return run((tx) => service.setBrand(tx, brandSchema.parse(formObject(fd, "null"))), "Saved.");
}

export async function createPillarAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return run((tx) => service.createPillar(tx, pillarCreateSchema.parse(formObject(fd))), "Pillar added.");
}

export async function renamePillarAction(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run((tx) => service.updatePillar(tx, id, pillarUpdateSchema.parse(formObject(fd, "null"))));
}

export async function archivePillarAction(id: string): Promise<void> {
  await runSimpleAction((tx) => service.updatePillar(tx, id, { archived: true }));
}

/** Quick capture: stays on the page. */
export async function captureIdeaAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return run((tx) => service.createItem(tx, itemCreateSchema.parse(formObject(fd))), "Idea saved.");
}

export async function createItemAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  let id: string | undefined;
  const state = await run(async (tx) => {
    id = (await service.createItem(tx, itemCreateSchema.parse(formObject(fd)))).id;
  });
  if (state?.ok && id) redirect(`/content/${id}`);
  return state;
}

export async function updateItemAction(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async (tx) => {
    const raw = formObject(fd, "null");
    for (const k of ["title", "status"]) if (raw[k] === null) delete raw[k];
    await service.updateItem(tx, id, itemUpdateSchema.parse(raw));
  }, "Saved.");
}

/** Next stage with an inline error if a rule blocks it (e.g. no platform yet). */
export async function advanceItemAction(id: string): Promise<ActionState> {
  return run((tx) => service.advanceItem(tx, id));
}

export async function archiveItemAction(id: string): Promise<void> {
  await runSimpleAction((tx) => service.updateItem(tx, id, { archived: true }));
  redirect("/content");
}

export async function repurposeAction(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  let newId: string | undefined;
  const state = await run(async (tx) => {
    newId = (await service.repurposeItem(tx, id, repurposeSchema.parse(formObject(fd)))).id;
  });
  if (state?.ok && newId) redirect(`/content/${newId}`);
  return state;
}

export async function addSourceAction(itemId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run((tx) => service.addSource(tx, itemId, sourceSchema.parse(formObject(fd))), "Source added.");
}

export async function deleteSourceAction(id: string): Promise<void> {
  await runSimpleAction((tx) => service.deleteSource(tx, id));
}

export async function recordMetricsAction(itemId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run((tx) => service.recordMetrics(tx, itemId, metricSchema.parse(formObject(fd)) as MetricInput), "Metrics saved.");
}

export async function deleteMetricsAction(id: string): Promise<void> {
  await runSimpleAction((tx) => service.deleteMetrics(tx, id));
}
