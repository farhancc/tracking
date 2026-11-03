import { roadmapSettingsSchema } from "@/features/roadmap/schemas";
import { updateRoadmapSettings } from "@/features/roadmap/server/service";
import { apiRoute } from "@/lib/api/route";

/** PATCH /api/v1/roadmap/settings: { weeklyCapacityHours, applyToFutureQuarters? } */
export const PATCH = apiRoute(async ({ tx, body }) => updateRoadmapSettings(tx, await body(roadmapSettingsSchema)));
