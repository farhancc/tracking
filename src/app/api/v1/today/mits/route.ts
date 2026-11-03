import { dayQuery } from "@/features/today/api";
import { setMitSchema } from "@/features/today/schemas";
import { setMit } from "@/features/today/server/service";
import { apiRoute } from "@/lib/api/route";

/** PUT /api/v1/today/mits?day=: { rank: 1|2|3, taskId | null }. */
export const PUT = apiRoute(async ({ tx, body, query }) => {
  const input = await body(setMitSchema);
  return setMit(tx, input.rank, input.taskId, query(dayQuery).day);
});
