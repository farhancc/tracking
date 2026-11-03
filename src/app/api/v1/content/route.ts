import { getOverview } from "@/features/content/server/service";
import { apiRoute } from "@/lib/api/route";

/** GET /api/v1/content: positioning, pillars, pipeline counts, pillar mix, upcoming, overdue, awaiting review */
export const GET = apiRoute(({ tx }) => getOverview(tx));
