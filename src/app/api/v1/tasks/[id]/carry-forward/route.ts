import { z } from "zod";
import { carryForwardSchema } from "@/features/weekly/schemas";
import { carryForward } from "@/features/weekly/server/service";
import { apiRoute } from "@/lib/api/route";

/** POST /api/v1/tasks/:id/carry-forward: { toWeek?, goalId? }. Default: the following week. */
export const POST = apiRoute<{ id: string }>(async ({ tx, params, body }) => {
  const input = await body(carryForwardSchema);
  return carryForward(tx, z.uuid().parse(params.id), { toWeek: input.toWeek, goalId: input.goalId });
});
