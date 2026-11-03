import { z } from "zod";
import { deleteAudience } from "@/features/content/server/analytics";
import { apiRoute } from "@/lib/api/route";

/** DELETE /api/v1/content/audience/:id */
export const DELETE = apiRoute<{ id: string }>(({ tx, params }) => deleteAudience(tx, z.uuid().parse(params.id)));
