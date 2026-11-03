import { z } from "zod";
import { kpiUpdateSchema } from "@/features/roadmap/schemas";
import { deleteKpi, updateKpi } from "@/features/roadmap/server/service";
import { apiRoute } from "@/lib/api/route";

type Params = { id: string };

/** PATCH /api/v1/roadmap/kpis/:id */
export const PATCH = apiRoute<Params>(async ({ tx, params, body }) => updateKpi(tx, z.uuid().parse(params.id), await body(kpiUpdateSchema)));

/** DELETE /api/v1/roadmap/kpis/:id */
export const DELETE = apiRoute<Params>(({ tx, params }) => deleteKpi(tx, z.uuid().parse(params.id)));
