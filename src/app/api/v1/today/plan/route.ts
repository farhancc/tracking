import { dayQuery } from "@/features/today/api";
import { dayPlanSchema } from "@/features/today/schemas";
import { saveDayPlan } from "@/features/today/server/service";
import { apiRoute } from "@/lib/api/route";

/** PUT /api/v1/today/plan?day=: { availableMinutes } */
export const PUT = apiRoute(async ({ tx, body, query }) => saveDayPlan(tx, (await body(dayPlanSchema)).availableMinutes, query(dayQuery).day));
