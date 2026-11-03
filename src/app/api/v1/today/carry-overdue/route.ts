import { dayQuery } from "@/features/today/api";
import { carryOverdueToToday } from "@/features/today/server/service";
import { apiRoute } from "@/lib/api/route";

/** POST /api/v1/today/carry-overdue?day=: schedule every overdue open task for the day. */
export const POST = apiRoute(({ tx, query }) => carryOverdueToToday(tx, query(dayQuery).day));
