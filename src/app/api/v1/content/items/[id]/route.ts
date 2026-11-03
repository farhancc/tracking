import { z } from "zod";
import { itemUpdateSchema } from "@/features/content/schemas";
import { getItem, updateItem } from "@/features/content/server/service";
import { apiRoute } from "@/lib/api/route";

type Params = { id: string };

/** GET /api/v1/content/items/:id: item, sources, metric snapshots, latest with computed engagement, versions */
export const GET = apiRoute<Params>(({ tx, params }) => getItem(tx, z.uuid().parse(params.id)));

/** PATCH /api/v1/content/items/:id: pipeline rules apply (platform from Script, date for Scheduled, metrics + lesson for review) */
export const PATCH = apiRoute<Params>(async ({ tx, params, body }) => updateItem(tx, z.uuid().parse(params.id), await body(itemUpdateSchema)));
