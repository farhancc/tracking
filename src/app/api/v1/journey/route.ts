import { journeyCreateSchema } from "@/features/goals/schemas";
import { createJourney, getWorkspace } from "@/features/goals/server/service";
import { apiRoute } from "@/lib/api/route";

/** GET /api/v1/journey: profile, active journey, pillars and today's date in the owner's timezone. */
export const GET = apiRoute(({ tx }) => getWorkspace(tx));

/** POST /api/v1/journey: start the five-year journey (creates profile and default pillars). */
export const POST = apiRoute(async ({ tx, body }) => createJourney(tx, await body(journeyCreateSchema)), { status: 201 });
