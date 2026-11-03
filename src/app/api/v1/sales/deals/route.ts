import { z } from "zod";
import { dealCreateSchema } from "@/features/sales/schemas";
import { createDeal, listDeals } from "@/features/sales/server/service";
import { apiRoute } from "@/lib/api/route";

const query = z.object({ trackId: z.uuid().optional(), open: z.enum(["true", "false"]).optional().transform((v) => v === "true") });

/** GET /api/v1/sales/deals?trackId=&open=true */
export const GET = apiRoute(({ tx, query: q }) => listDeals(tx, q(query)));

/** POST /api/v1/sales/deals */
export const POST = apiRoute(async ({ tx, body }) => createDeal(tx, await body(dealCreateSchema)), { status: 201 });
