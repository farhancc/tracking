import { z } from "zod";
import { activityCreateSchema } from "@/features/sales/schemas";
import { listActivities, logActivity } from "@/features/sales/server/service";
import { apiRoute } from "@/lib/api/route";

const query = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  trackId: z.uuid().optional(),
  prospectId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

/** GET /api/v1/sales/activities?from=&to=&trackId=&prospectId= */
export const GET = apiRoute(({ tx, query: q }) => listActivities(tx, q(query)));

/**
 * POST /api/v1/sales/activities: { kind, outcome? (cold calls), connected?, reachedDecisionMaker?, qualified?,
 * meetingBooked?, amount? (quotations), currency?, prospectId?, dealId?, trackId?, channel?, occurredOn?, notes? }
 */
export const POST = apiRoute(async ({ tx, body }) => logActivity(tx, await body(activityCreateSchema)), { status: 201 });
