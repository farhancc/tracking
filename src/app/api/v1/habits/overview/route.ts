import { getHabitsOverview } from "@/features/habits/server/service";
import { apiRoute } from "@/lib/api/route";

/** GET /api/v1/habits/overview: per-habit week/month/30-day consistency, streaks, last 14 days, missed analysis, trends, priority correlation */
export const GET = apiRoute(({ tx }) => getHabitsOverview(tx));
