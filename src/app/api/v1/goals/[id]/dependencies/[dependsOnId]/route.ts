import { z } from "zod";
import { removeDependency } from "@/features/goals/server/service";
import { apiRoute } from "@/lib/api/route";

/** DELETE /api/v1/goals/:id/dependencies/:dependsOnId */
export const DELETE = apiRoute<{ id: string; dependsOnId: string }>(({ tx, params }) =>
  removeDependency(tx, z.uuid().parse(params.id), z.uuid().parse(params.dependsOnId)),
);
