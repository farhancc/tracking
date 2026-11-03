import { z } from "zod";
import { productUpdateSchema } from "@/features/products/schemas";
import { getProduct, updateProduct } from "@/features/products/server/service";
import { apiRoute } from "@/lib/api/route";

type Params = { id: string };

/** GET /api/v1/products/:id: product, figures, assessment, milestones, releases, backlog, feedback, bugs */
export const GET = apiRoute<Params>(({ tx, params }) => getProduct(tx, z.uuid().parse(params.id)));

/** PATCH /api/v1/products/:id: moving to a launched stage sets the launch date to today unless given */
export const PATCH = apiRoute<Params>(async ({ tx, params, body }) => updateProduct(tx, z.uuid().parse(params.id), await body(productUpdateSchema)));
