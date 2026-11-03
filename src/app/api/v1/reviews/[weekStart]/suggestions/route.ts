import { z } from "zod";
import { approveSuggestion } from "@/features/review/server/service";
import { weeklyGoalCreateSchema } from "@/features/weekly/schemas";
import { apiRoute } from "@/lib/api/route";
import { isIsoDate } from "@/lib/domain/dates";

/** POST /api/v1/reviews/:weekStart/suggestions: approve a (possibly edited) suggestion as a goal for the following week */
export const POST = apiRoute<{ weekStart: string }>(
  async ({ tx, params, body }) => approveSuggestion(tx, z.string().refine(isIsoDate).parse(params.weekStart), await body(weeklyGoalCreateSchema)),
  { status: 201 },
);
