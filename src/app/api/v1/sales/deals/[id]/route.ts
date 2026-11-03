import { z } from "zod";
import { dealUpdateSchema } from "@/features/sales/schemas";
import { updateDeal } from "@/features/sales/server/service";
import { apiRoute } from "@/lib/api/route";

/** PATCH /api/v1/sales/deals/:id: stage changes; won requires an amount; closed_on defaults to today. */
export const PATCH = apiRoute<{ id: string }>(async ({ tx, params, body }) => updateDeal(tx, z.uuid().parse(params.id), await body(dealUpdateSchema)));
