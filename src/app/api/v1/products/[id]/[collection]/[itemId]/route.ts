import { z } from "zod";
import { COLLECTIONS } from "@/features/products/schemas";
import { deleteItem, updateItem } from "@/features/products/server/service";
import { apiRoute } from "@/lib/api/route";

type Params = { id: string; collection: string; itemId: string };
const parse = (p: Params) => [z.uuid().parse(p.id), z.enum(COLLECTIONS).parse(p.collection), z.uuid().parse(p.itemId)] as const;

/** PATCH /api/v1/products/:id/:collection/:itemId */
export const PATCH = apiRoute<Params>(async ({ tx, params, body }) => {
  const [id, collection, itemId] = parse(params);
  return updateItem(tx, id, collection, itemId, await body(z.unknown()));
});

/** DELETE /api/v1/products/:id/:collection/:itemId */
export const DELETE = apiRoute<Params>(async ({ tx, params }) => {
  const [id, collection, itemId] = parse(params);
  await deleteItem(tx, id, collection, itemId);
});
