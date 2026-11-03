import { z } from "zod";
import { promoteSchema } from "@/features/knowledge/schemas";
import { promoteConcept } from "@/features/knowledge/server/service";
import { apiRoute } from "@/lib/api/route";

/** POST /api/v1/knowledge/concepts/:id/promote: { category } → a psychology lab concept for spaced review */
export const POST = apiRoute<{ id: string }>(async ({ tx, params, body }) => promoteConcept(tx, z.uuid().parse(params.id), (await body(promoteSchema)).category), {
  status: 201,
});
