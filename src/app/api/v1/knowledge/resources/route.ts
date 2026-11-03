import { resourceCreateSchema, resourceQuerySchema } from "@/features/knowledge/schemas";
import { createResource, listResources } from "@/features/knowledge/server/service";
import { apiRoute } from "@/lib/api/route";

/** GET /api/v1/knowledge/resources?kind=&status=&category=&q= */
export const GET = apiRoute(({ tx, query }) => listResources(tx, query(resourceQuerySchema)));

/** POST /api/v1/knowledge/resources */
export const POST = apiRoute(async ({ tx, body }) => createResource(tx, await body(resourceCreateSchema)), { status: 201 });
