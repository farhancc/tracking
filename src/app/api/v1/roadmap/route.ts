import { getRoadmap } from "@/features/roadmap/server/service";
import { apiRoute } from "@/lib/api/route";

/** GET /api/v1/roadmap: 5 annual plans with their quarters, planned vs actual per quarter. */
export const GET = apiRoute(async ({ tx }) => {
  const { workspace, ...roadmap } = await getRoadmap(tx);
  return { today: workspace.today, ...roadmap };
});
