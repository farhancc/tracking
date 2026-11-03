import { dayQuery } from "@/features/today/api";
import { reflectionSchema } from "@/features/today/schemas";
import { saveReflection } from "@/features/today/server/service";
import { apiRoute } from "@/lib/api/route";

/** PUT /api/v1/today/reflection?day=: { accomplished?, learned?, wentWrong?, improveTomorrow? } */
export const PUT = apiRoute(async ({ tx, body, query }) => saveReflection(tx, await body(reflectionSchema), query(dayQuery).day));
