import { z } from "zod";
import { pillarCreateSchema } from "@/features/content/schemas";
import { createPillar, listPillars } from "@/features/content/server/service";
import { apiRoute } from "@/lib/api/route";

/** GET /api/v1/content/pillars?includeArchived= */
export const GET = apiRoute(({ tx, query }) => listPillars(tx, query(z.object({ includeArchived: z.enum(["true", "false"]).optional() })).includeArchived === "true"));

/** POST /api/v1/content/pillars */
export const POST = apiRoute(async ({ tx, body }) => createPillar(tx, await body(pillarCreateSchema)), { status: 201 });
