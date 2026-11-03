import { goalSchema } from "@/features/knowledge/schemas";
import { setGoal } from "@/features/knowledge/server/service";
import { apiRoute } from "@/lib/api/route";

/** PUT /api/v1/knowledge/reading/goal: { year, targetCount?, kinds?, dailyMinutes? } */
export const PUT = apiRoute(async ({ tx, body }) => setGoal(tx, await body(goalSchema)));
