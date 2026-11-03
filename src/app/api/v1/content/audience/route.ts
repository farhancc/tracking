import { audienceSchema } from "@/features/content/schemas";
import { recordAudience } from "@/features/content/server/analytics";
import { apiRoute } from "@/lib/api/route";

/** POST /api/v1/content/audience: { platform, followers, capturedOn?, notes? } (upsert per platform and date) */
export const POST = apiRoute(async ({ tx, body }) => recordAudience(tx, await body(audienceSchema)), { status: 201 });
