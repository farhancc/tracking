import { z } from "zod";
import { riskUpdateSchema } from "@/features/roadmap/schemas";
import { deleteRisk, updateRisk } from "@/features/roadmap/server/service";
import { apiRoute } from "@/lib/api/route";

type Params = { id: string };

/** PATCH /api/v1/roadmap/risks/:id */
export const PATCH = apiRoute<Params>(async ({ tx, params, body }) => updateRisk(tx, z.uuid().parse(params.id), await body(riskUpdateSchema)));

/** DELETE /api/v1/roadmap/risks/:id */
export const DELETE = apiRoute<Params>(({ tx, params }) => deleteRisk(tx, z.uuid().parse(params.id)));
