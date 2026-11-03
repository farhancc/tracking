import { z } from "zod";
import { prospectUpdateSchema } from "@/features/sales/schemas";
import { updateProspect } from "@/features/sales/server/service";
import { apiRoute } from "@/lib/api/route";

/** PATCH /api/v1/sales/prospects/:id */
export const PATCH = apiRoute<{ id: string }>(async ({ tx, params, body }) => updateProspect(tx, z.uuid().parse(params.id), await body(prospectUpdateSchema)));
