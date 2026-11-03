import { z } from "zod";
import { dependencyCreateSchema } from "@/features/goals/schemas";
import { addDependency } from "@/features/goals/server/service";
import { apiRoute } from "@/lib/api/route";

/** POST /api/v1/goals/:id/dependencies: this goal depends on `dependsOnGoalId`. Cycles → 422 dependency_cycle. */
export const POST = apiRoute<{ id: string }>(
  async ({ tx, params, body }) => addDependency(tx, z.uuid().parse(params.id), await body(dependencyCreateSchema)),
  { status: 201 },
);
