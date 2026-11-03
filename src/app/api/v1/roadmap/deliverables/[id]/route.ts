import { z } from "zod";
import { deliverableUpdateSchema } from "@/features/roadmap/schemas";
import { deleteDeliverable, updateDeliverable } from "@/features/roadmap/server/service";
import { apiRoute } from "@/lib/api/route";

type Params = { id: string };

/** PATCH /api/v1/roadmap/deliverables/:id */
export const PATCH = apiRoute<Params>(async ({ tx, params, body }) => updateDeliverable(tx, z.uuid().parse(params.id), await body(deliverableUpdateSchema)));

/** DELETE /api/v1/roadmap/deliverables/:id */
export const DELETE = apiRoute<Params>(({ tx, params }) => deleteDeliverable(tx, z.uuid().parse(params.id)));
