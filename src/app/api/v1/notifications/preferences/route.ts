import { preferencesSchema } from "@/features/notifications/schemas";
import { getPreferences, savePreferences } from "@/features/notifications/server/service";
import { apiRoute } from "@/lib/api/route";

/** GET /api/v1/notifications/preferences */
export const GET = apiRoute(({ tx }) => getPreferences(tx));

/** PUT /api/v1/notifications/preferences: the full preference object. */
export const PUT = apiRoute(async ({ tx, body }) => savePreferences(tx, await body(preferencesSchema)));
