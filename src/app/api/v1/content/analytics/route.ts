import { analyticsQuerySchema } from "@/features/content/schemas";
import { getAnalytics } from "@/features/content/server/analytics";
import { apiRoute } from "@/lib/api/route";

/** GET /api/v1/content/analytics?window=30|90|365|all&platform=&sort=business|leads|trust|engagement|views|followers */
export const GET = apiRoute(({ tx, query }) => getAnalytics(tx, query(analyticsQuerySchema)));
