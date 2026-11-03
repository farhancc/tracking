import { z } from "zod";
import { getValidation } from "@/features/products/server/validation";
import { apiRoute } from "@/lib/api/route";

/** GET /api/v1/products/:id/validation: 12 steps with evidence, interviews, competitors, demand evidence */
export const GET = apiRoute<{ id: string }>(({ tx, params }) => getValidation(tx, z.uuid().parse(params.id)));
