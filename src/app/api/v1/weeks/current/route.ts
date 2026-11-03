import { getWeek } from "@/features/weekly/server/service";
import { apiRoute } from "@/lib/api/route";

/** GET /api/v1/weeks/current: this week's plan, goals by area, tasks, unfinished work and scorecard. */
export const GET = apiRoute(async ({ tx }) => {
  const { workspace, ...week } = await getWeek(tx);
  return { today: workspace.today, ...week };
});
