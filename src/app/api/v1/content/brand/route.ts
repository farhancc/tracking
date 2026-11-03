import { brandSchema } from "@/features/content/schemas";
import { getBrand, setBrand } from "@/features/content/server/service";
import { apiRoute } from "@/lib/api/route";

/** GET /api/v1/content/brand */
export const GET = apiRoute(({ tx }) => getBrand(tx));

/** PUT /api/v1/content/brand: { positioning, audience? } */
export const PUT = apiRoute(async ({ tx, body }) => setBrand(tx, await body(brandSchema)));
