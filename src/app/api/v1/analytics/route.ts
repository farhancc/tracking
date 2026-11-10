import { analyticsQuerySchema } from "@/features/analytics/schemas";
import { getAnalytics } from "@/features/analytics/server/service";
import { apiRoute } from "@/lib/api/route";

/** GET /api/v1/analytics?range=7d|30d|90d|1y|journey|month:YYYY-MM */
export const GET = apiRoute(({ tx, query }) => getAnalytics(tx, query(analyticsQuerySchema).range));
