import { z } from "zod";
import { dayQuery } from "@/features/today/api";
import { checkinSchema } from "@/features/today/schemas";
import { checkInHabit } from "@/features/today/server/service";
import { apiRoute } from "@/lib/api/route";

/** PUT /api/v1/habits/:id/checkins?day=: { status: "done" | "skipped" | null, note? } */
export const PUT = apiRoute<{ id: string }>(async ({ tx, params, body, query }) => {
  const input = await body(checkinSchema);
  return checkInHabit(tx, z.uuid().parse(params.id), input.status, query(dayQuery).day, input.note);
});
