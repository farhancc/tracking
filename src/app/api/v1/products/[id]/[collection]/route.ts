import { z } from "zod";
import { COLLECTIONS } from "@/features/products/schemas";
import { createItem } from "@/features/products/server/service";
import { apiRoute } from "@/lib/api/route";

type Params = { id: string; collection: string };

/**
 * POST /api/v1/products/:id/:collection
 * collection: metrics (upsert by month) | transactions | milestones | releases | features | feedback | bugs
 */
export const POST = apiRoute<Params>(
  async ({ tx, params, body }) => createItem(tx, z.uuid().parse(params.id), z.enum(COLLECTIONS).parse(params.collection), await body(z.unknown())),
  { status: 201 },
);
