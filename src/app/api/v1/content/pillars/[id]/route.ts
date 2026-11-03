import { z } from "zod";
import { pillarUpdateSchema } from "@/features/content/schemas";
import { updatePillar } from "@/features/content/server/service";
import { apiRoute } from "@/lib/api/route";

/** PATCH /api/v1/content/pillars/:id: { name?, description?, sortOrder?, archived? } */
export const PATCH = apiRoute<{ id: string }>(async ({ tx, params, body }) => updatePillar(tx, z.uuid().parse(params.id), await body(pillarUpdateSchema)));
