import { z } from "zod";
import { prospectCreateSchema } from "@/features/sales/schemas";
import { createProspect, listProspects } from "@/features/sales/server/service";
import { apiRoute } from "@/lib/api/route";

const query = z.object({ trackId: z.uuid().optional(), status: z.string().optional(), q: z.string().max(100).optional() });

/** GET /api/v1/sales/prospects?trackId=&status=&q= */
export const GET = apiRoute(({ tx, query: q }) => listProspects(tx, q(query)));

/** POST /api/v1/sales/prospects */
export const POST = apiRoute(async ({ tx, body }) => createProspect(tx, await body(prospectCreateSchema)), { status: 201 });
