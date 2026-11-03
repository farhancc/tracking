import { z } from "zod";
import { productCreateSchema } from "@/features/products/schemas";
import { createProduct, getPortfolio } from "@/features/products/server/service";
import { apiRoute } from "@/lib/api/route";

const portfolioQuery = z.object({ includeArchived: z.enum(["true", "false"]).optional() });

/** GET /api/v1/products: portfolio overview with per-product figures and recommendations */
export const GET = apiRoute(({ tx, query }) => getPortfolio(tx, { includeArchived: query(portfolioQuery).includeArchived === "true" }));

/** POST /api/v1/products */
export const POST = apiRoute(async ({ tx, body }) => createProduct(tx, await body(productCreateSchema)), { status: 201 });
