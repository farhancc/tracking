import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { salesTargets } from "@/db/schema";
import { targetSetSchema } from "@/features/sales/schemas";
import { setTarget } from "@/features/sales/server/service";
import { apiRoute } from "@/lib/api/route";

/** GET /api/v1/sales/targets?trackId= */
export const GET = apiRoute(({ tx, query }) => {
  const { trackId } = query(z.object({ trackId: z.uuid().optional() }));
  return tx
    .select()
    .from(salesTargets)
    .where(trackId ? and(eq(salesTargets.trackId, trackId)) : undefined)
    .orderBy(asc(salesTargets.metric), asc(salesTargets.period), asc(salesTargets.effectiveFrom));
});

/** PUT /api/v1/sales/targets: { trackId, metric, period, targetValue | null, effectiveFrom? } (effective-dated) */
export const PUT = apiRoute(async ({ tx, body }) => setTarget(tx, await body(targetSetSchema)));
