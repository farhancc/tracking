import { sessionSchema } from "@/features/knowledge/schemas";
import { logSession } from "@/features/knowledge/server/service";
import { apiRoute } from "@/lib/api/route";

/** POST /api/v1/knowledge/reading/sessions: { minutes, readOn?, units?, resourceId?, note?, progressTo? } */
export const POST = apiRoute(async ({ tx, body }) => logSession(tx, await body(sessionSchema)), { status: 201 });
