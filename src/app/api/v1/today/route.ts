import { dayQuery } from "@/features/today/api";
import { getToday } from "@/features/today/server/service";
import { apiRoute } from "@/lib/api/route";

/** GET /api/v1/today?day=: the daily execution dashboard. */
export const GET = apiRoute(async ({ tx, query }) => {
  const { workspace, ...today } = await getToday(tx, query(dayQuery).day);
  return { timezone: workspace.profile?.timezone ?? "UTC", ...today };
});
