import { quarterNumberSchema, kpiCreateSchema } from "@/features/roadmap/schemas";
import { addKpi } from "@/features/roadmap/server/service";
import { apiRoute } from "@/lib/api/route";

/** POST /api/v1/roadmap/quarters/:quarter/kpis: add a KPI to the quarter. */
export const POST = apiRoute<{ quarter: string }>(
  async ({ tx, params, body }) => addKpi(tx, quarterNumberSchema.parse(params.quarter), await body(kpiCreateSchema)),
  { status: 201 },
);
