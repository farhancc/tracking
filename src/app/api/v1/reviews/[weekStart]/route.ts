import { z } from "zod";
import { answersSchema } from "@/features/review/schemas";
import { getReview, saveReview } from "@/features/review/server/service";
import { apiRoute } from "@/lib/api/route";
import { isIsoDate } from "@/lib/domain/dates";

type Params = { weekStart: string };
const week = (p: Params) => z.string().refine(isIsoDate).parse(p.weekStart);

/** GET /api/v1/reviews/:weekStart */
export const GET = apiRoute<Params>(({ tx, params }) => getReview(tx, week(params)));

/** PUT /api/v1/reviews/:weekStart: save answers as a draft */
export const PUT = apiRoute<Params>(async ({ tx, params, body }) => (await saveReview(tx, week(params), await body(answersSchema))).row);
