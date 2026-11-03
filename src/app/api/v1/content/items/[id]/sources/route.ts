import { z } from "zod";
import { sourceSchema } from "@/features/content/schemas";
import { addSource } from "@/features/content/server/service";
import { apiRoute } from "@/lib/api/route";

/** POST /api/v1/content/items/:id/sources: { title, url?, notes? } */
export const POST = apiRoute<{ id: string }>(async ({ tx, params, body }) => addSource(tx, z.uuid().parse(params.id), await body(sourceSchema)), { status: 201 });
