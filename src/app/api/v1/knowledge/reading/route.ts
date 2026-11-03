import { getReading } from "@/features/knowledge/server/service";
import { apiRoute } from "@/lib/api/route";

/** GET /api/v1/knowledge/reading: this year's goal, daily stats and streak, recent sessions */
export const GET = apiRoute(({ tx }) => getReading(tx));
