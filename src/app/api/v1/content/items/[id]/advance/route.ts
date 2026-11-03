import { z } from "zod";
import { advanceItem } from "@/features/content/server/service";
import { apiRoute } from "@/lib/api/route";

/** POST /api/v1/content/items/:id/advance: move to the next pipeline stage */
export const POST = apiRoute<{ id: string }>(({ tx, params }) => advanceItem(tx, z.uuid().parse(params.id)));
