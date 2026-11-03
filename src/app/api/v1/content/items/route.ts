import { itemCreateSchema, itemQuerySchema } from "@/features/content/schemas";
import { createItem, listItems } from "@/features/content/server/service";
import { apiRoute } from "@/lib/api/route";

/** GET /api/v1/content/items?status=&pillarId=&platform=&q=&ideas=true */
export const GET = apiRoute(({ tx, query }) => listItems(tx, query(itemQuerySchema)));

/** POST /api/v1/content/items */
export const POST = apiRoute(async ({ tx, body }) => createItem(tx, await body(itemCreateSchema)), { status: 201 });
