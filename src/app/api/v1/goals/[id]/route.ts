import { z } from "zod";
import { goalUpdateSchema } from "@/features/goals/schemas";
import { archiveGoal, getGoalDetail, updateGoal } from "@/features/goals/server/service";
import { apiRoute } from "@/lib/api/route";

type Params = { id: string };
const id = z.uuid();

/** GET /api/v1/goals/:id: goal with ancestors, children, dependencies, related goals, measurements and tasks. */
export const GET = apiRoute<Params>(async ({ tx, params }) => {
  const { workspace, ...detail } = await getGoalDetail(tx, id.parse(params.id));
  return { today: workspace.today, ...detail };
});

/**
 * PATCH /api/v1/goals/:id: partial update, including status.
 * Setting status "achieved" fails with 422 achievement_requires_outcome or
 * blocked_by_dependencies unless the outcome and prerequisites allow it.
 */
export const PATCH = apiRoute<Params>(async ({ tx, params, body }) =>
  updateGoal(tx, id.parse(params.id), await body(goalUpdateSchema)),
);

/** DELETE /api/v1/goals/:id: archives the goal and its sub-goals (restorable). */
export const DELETE = apiRoute<Params>(({ tx, params }) => archiveGoal(tx, id.parse(params.id)));
