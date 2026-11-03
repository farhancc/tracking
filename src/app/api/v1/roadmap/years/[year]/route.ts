import { yearNumberSchema, yearUpdateSchema } from "@/features/roadmap/schemas";
import { updateYear } from "@/features/roadmap/server/service";
import { apiRoute } from "@/lib/api/route";

/** PATCH /api/v1/roadmap/years/:year: { theme?, direction?, isProvisional?, notes? } */
export const PATCH = apiRoute<{ year: string }>(async ({ tx, params, body }) =>
  updateYear(tx, yearNumberSchema.parse(params.year), await body(yearUpdateSchema)),
);
