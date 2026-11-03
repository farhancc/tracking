import { z } from "zod";
import { getReview } from "@/features/review/server/service";
import { apiRoute } from "@/lib/api/route";
import { isIsoDate } from "@/lib/domain/dates";

const q = z.object({ week: z.string().refine(isIsoDate, "Use a week start date.").optional() });

/** GET /api/v1/reviews?week=: report, observations, patterns, answers and next-week suggestions (default: the week to review now) */
export const GET = apiRoute(({ tx, query }) => getReview(tx, query(q).week));
