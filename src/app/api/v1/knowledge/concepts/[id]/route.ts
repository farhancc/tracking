import { z } from "zod";
import { deleteConcept } from "@/features/knowledge/server/service";
import { apiRoute } from "@/lib/api/route";

/** DELETE /api/v1/knowledge/concepts/:id (409 while an application uses it) */
export const DELETE = apiRoute<{ id: string }>(({ tx, params }) => deleteConcept(tx, z.uuid().parse(params.id)));
