import { quarterNumberSchema, quarterDependencyCreateSchema } from "@/features/roadmap/schemas";
import { addQuarterDependency } from "@/features/roadmap/server/service";
import { apiRoute } from "@/lib/api/route";

/** POST /api/v1/roadmap/quarters/:quarter/dependencies: add a dependency to the quarter. */
export const POST = apiRoute<{ quarter: string }>(
  async ({ tx, params, body }) => addQuarterDependency(tx, quarterNumberSchema.parse(params.quarter), await body(quarterDependencyCreateSchema)),
  { status: 201 },
);
