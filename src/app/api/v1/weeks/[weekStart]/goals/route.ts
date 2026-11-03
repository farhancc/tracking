import { weekStartSchema, weeklyGoalCreateSchema } from "@/features/weekly/schemas";
import { createWeeklyGoal } from "@/features/weekly/server/service";
import { apiRoute } from "@/lib/api/route";

/** POST /api/v1/weeks/:weekStart/goals: { focusArea, parentId, title, successMetric, targetValue, unit?, measurementMode?, … } */
export const POST = apiRoute<{ weekStart: string }>(
  async ({ tx, params, body }) => createWeeklyGoal(tx, weekStartSchema.parse(params.weekStart), await body(weeklyGoalCreateSchema)),
  { status: 201 },
);
