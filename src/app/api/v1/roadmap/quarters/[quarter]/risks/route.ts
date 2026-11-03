import { quarterNumberSchema, riskCreateSchema } from "@/features/roadmap/schemas";
import { addRisk } from "@/features/roadmap/server/service";
import { apiRoute } from "@/lib/api/route";

/** POST /api/v1/roadmap/quarters/:quarter/risks: add a risk to the quarter. */
export const POST = apiRoute<{ quarter: string }>(
  async ({ tx, params, body }) => addRisk(tx, quarterNumberSchema.parse(params.quarter), await body(riskCreateSchema)),
  { status: 201 },
);
