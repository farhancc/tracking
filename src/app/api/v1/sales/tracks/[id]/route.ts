import { z } from "zod";
import { trackUpdateSchema } from "@/features/sales/schemas";
import { updateTrack } from "@/features/sales/server/service";
import { apiRoute } from "@/lib/api/route";

/** PATCH /api/v1/sales/tracks/:id: { name?, currency?, description?, isDefault?, archived? } */
export const PATCH = apiRoute<{ id: string }>(async ({ tx, params, body }) => updateTrack(tx, z.uuid().parse(params.id), await body(trackUpdateSchema)));
