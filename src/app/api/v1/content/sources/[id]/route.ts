import { z } from "zod";
import { deleteSource } from "@/features/content/server/service";
import { apiRoute } from "@/lib/api/route";

/** DELETE /api/v1/content/sources/:id */
export const DELETE = apiRoute<{ id: string }>(({ tx, params }) => deleteSource(tx, z.uuid().parse(params.id)));
