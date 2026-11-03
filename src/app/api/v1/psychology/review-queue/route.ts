import { reviewQueue } from "@/features/psychology/server/service";
import { apiRoute } from "@/lib/api/route";

/** GET /api/v1/psychology/review-queue: concepts due today or earlier */
export const GET = apiRoute(({ tx }) => reviewQueue(tx));
