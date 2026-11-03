import { z } from "zod";
import { answersSchema } from "@/features/review/schemas";
import { completeReview } from "@/features/review/server/service";
import { apiRoute } from "@/lib/api/route";
import { isIsoDate } from "@/lib/domain/dates";

/** POST /api/v1/reviews/:weekStart/complete: every missed goal needs a reason; freezes the report and marks the week reviewed */
export const POST = apiRoute<{ weekStart: string }>(async ({ tx, params, body }) => completeReview(tx, z.string().refine(isIsoDate).parse(params.weekStart), await body(answersSchema)));
