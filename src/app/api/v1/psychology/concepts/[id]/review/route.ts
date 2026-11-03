import { z } from "zod";
import { reviewSchema } from "@/features/psychology/schemas";
import { reviewConcept } from "@/features/psychology/server/service";
import { apiRoute } from "@/lib/api/route";

/** POST /api/v1/psychology/concepts/:id/review: { rating: again | hard | good | easy }, which reschedules the concept */
export const POST = apiRoute<{ id: string }>(async ({ tx, params, body }) => reviewConcept(tx, z.uuid().parse(params.id), (await body(reviewSchema)).rating));
