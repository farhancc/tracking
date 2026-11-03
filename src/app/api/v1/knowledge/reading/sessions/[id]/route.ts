import { z } from "zod";
import { deleteSession } from "@/features/knowledge/server/service";
import { apiRoute } from "@/lib/api/route";

/** DELETE /api/v1/knowledge/reading/sessions/:id */
export const DELETE = apiRoute<{ id: string }>(({ tx, params }) => deleteSession(tx, z.uuid().parse(params.id)));
