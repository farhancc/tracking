"use server";

import { redirect } from "next/navigation";
import type { Tx } from "@/db/client";
import { formNullable, formObject, formText, runAction, runSimpleAction, type ActionState } from "@/lib/server-action";
import { productCreateSchema, productUpdateSchema, type Collection } from "../schemas";
import * as service from "./service";

const run = (fn: (tx: Tx) => Promise<unknown>, success?: string) => runAction(fn, { success });

const channels = (fd: FormData) =>
  (formText(fd, "acquisitionChannels") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

function productFromForm(fd: FormData, empty: "undefined" | "null"): Record<string, unknown> {
  const raw = formObject(fd, empty);
  return { ...raw, acquisitionChannels: channels(fd) };
}

export async function createProductAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  let id: string | undefined;
  const state = await run(async (tx) => {
    id = (await service.createProduct(tx, productCreateSchema.parse(productFromForm(fd, "undefined")))).id;
  });
  if (state?.ok && id) redirect(`/products/${id}`);
  return state;
}

export async function updateProductAction(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async (tx) => {
    const raw = productFromForm(fd, "null");
    // Required fields can't be cleared from the form; drop them if empty.
    for (const k of ["name", "currency", "startedOn", "businessModel", "stage", "status"] as const) if (raw[k] === null) delete raw[k];
    await service.updateProduct(tx, id, productUpdateSchema.parse(raw));
  }, "Saved.");
}

export async function setStageAction(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async (tx) => {
    await service.updateProduct(
      tx,
      id,
      productUpdateSchema.parse({ stage: formText(fd, "stage"), status: formText(fd, "status"), statusNote: formNullable(fd, "statusNote") }),
    );
  }, "Updated.");
}

export async function archiveProductAction(id: string): Promise<void> {
  await runSimpleAction((tx) => service.updateProduct(tx, id, { archived: true }));
  redirect("/products");
}

export async function createItemAction(productId: string, collection: Collection, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run((tx) => service.createItem(tx, productId, collection, formObject(fd, "undefined")), "Saved.");
}

export async function updateItemAction(productId: string, collection: Collection, itemId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run((tx) => service.updateItem(tx, productId, collection, itemId, formObject(fd, "null")), "Saved.");
}

/** Quick status change from a select that submits on its own. */
export async function setItemFieldAction(productId: string, collection: Collection, itemId: string, fd: FormData): Promise<void> {
  await runSimpleAction((tx) => service.updateItem(tx, productId, collection, itemId, formObject(fd, "null")));
}

export async function deleteItemAction(productId: string, collection: Collection, itemId: string): Promise<void> {
  await runSimpleAction((tx) => service.deleteItem(tx, productId, collection, itemId));
}
