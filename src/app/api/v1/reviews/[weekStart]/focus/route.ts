import { z } from "zod";
import { setNextWeekFocus } from "@/features/review/server/service";
import { apiRoute } from "@/lib/api/route";
import { isIsoDate } from "@/lib/domain/dates";

/** POST /api/v1/reviews/:weekStart/focus: { focus } becomes the following week's focus */
export const POST = apiRoute<{ weekStart: string }>(async ({ tx, params, body }) =>
  setNextWeekFocus(tx, z.string().refine(isIsoDate).parse(params.weekStart), (await body(z.object({ focus: z.string().trim().min(1).max(500) }))).focus),
);
