import { conceptCreateSchema, conceptQuerySchema } from "@/features/psychology/schemas";
import { createConcept, listConcepts } from "@/features/psychology/server/service";
import { apiRoute } from "@/lib/api/route";

/** GET /api/v1/psychology/concepts?category=&evidence=&understanding=&q= */
export const GET = apiRoute(({ tx, query }) => listConcepts(tx, query(conceptQuerySchema)));

/** POST /api/v1/psychology/concepts */
export const POST = apiRoute(async ({ tx, body }) => createConcept(tx, await body(conceptCreateSchema)), { status: 201 });
