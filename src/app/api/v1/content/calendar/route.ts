import { calendarQuerySchema } from "@/features/content/schemas";
import { getCalendar } from "@/features/content/server/service";
import { apiRoute } from "@/lib/api/route";

/** GET /api/v1/content/calendar?month=YYYY-MM: published (actual), scheduled and planned recording dates */
export const GET = apiRoute(({ tx, query }) => getCalendar(tx, query(calendarQuerySchema).month));
