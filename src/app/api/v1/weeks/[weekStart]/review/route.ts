import { weekReviewSchema, weekStartSchema } from "@/features/weekly/schemas";
import { reviewWeek } from "@/features/weekly/server/service";
import { apiRoute } from "@/lib/api/route";

/** POST /api/v1/weeks/:weekStart/review: { wins?, lessons?, notes? }. Freezes the scorecard. */
export const POST = apiRoute<{ weekStart: string }>(
  async ({ tx, params, body }) => reviewWeek(tx, weekStartSchema.parse(params.weekStart), await body(weekReviewSchema)),
  { status: 201 },
);
