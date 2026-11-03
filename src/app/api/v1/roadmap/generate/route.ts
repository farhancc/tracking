import { generateRoadmap } from "@/features/roadmap/server/service";
import { apiRoute } from "@/lib/api/route";

/** POST /api/v1/roadmap/generate: create the 5 years and 20 quarters (idempotent; keeps edits). */
export const POST = apiRoute(async ({ tx }) => {
  const { workspace, ...roadmap } = await generateRoadmap(tx);
  return { today: workspace.today, ...roadmap };
}, { status: 201 });
