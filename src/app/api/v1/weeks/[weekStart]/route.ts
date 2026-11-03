import { weekPlanSchema, weekStartSchema } from "@/features/weekly/schemas";
import { getWeek, saveWeekPlan } from "@/features/weekly/server/service";
import { apiRoute } from "@/lib/api/route";

type Params = { weekStart: string };

/** GET /api/v1/weeks/:weekStart (YYYY-MM-DD, must be a week start) */
export const GET = apiRoute<Params>(async ({ tx, params }) => {
  const { workspace, ...week } = await getWeek(tx, weekStartSchema.parse(params.weekStart));
  return { today: workspace.today, ...week };
});

/** PATCH /api/v1/weeks/:weekStart: { focus?, capacityHours? } */
export const PATCH = apiRoute<Params>(async ({ tx, params, body }) =>
  saveWeekPlan(tx, weekStartSchema.parse(params.weekStart), await body(weekPlanSchema)),
);
