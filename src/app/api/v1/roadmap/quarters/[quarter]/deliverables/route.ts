import { quarterNumberSchema, deliverableCreateSchema } from "@/features/roadmap/schemas";
import { addDeliverable } from "@/features/roadmap/server/service";
import { apiRoute } from "@/lib/api/route";

/** POST /api/v1/roadmap/quarters/:quarter/deliverables: add a deliverable to the quarter. */
export const POST = apiRoute<{ quarter: string }>(
  async ({ tx, params, body }) => addDeliverable(tx, quarterNumberSchema.parse(params.quarter), await body(deliverableCreateSchema)),
  { status: 201 },
);
