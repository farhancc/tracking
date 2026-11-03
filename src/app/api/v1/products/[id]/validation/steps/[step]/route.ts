import { z } from "zod";
import { stepUpdateSchema } from "@/features/products/schemas";
import { updateStep } from "@/features/products/server/validation";
import { apiRoute } from "@/lib/api/route";
import { VALIDATION_STEPS } from "@/lib/domain/product-validation";

/** PATCH /api/v1/products/:id/validation/steps/:step: { status?, successCriteria?, notes? }; validated/invalidated need evidence */
export const PATCH = apiRoute<{ id: string; step: string }>(async ({ tx, params, body }) =>
  updateStep(tx, z.uuid().parse(params.id), z.enum(VALIDATION_STEPS).parse(params.step), await body(stepUpdateSchema)),
);
