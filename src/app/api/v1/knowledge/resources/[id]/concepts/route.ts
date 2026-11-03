import { z } from "zod";
import { conceptSchema } from "@/features/knowledge/schemas";
import { addConcept } from "@/features/knowledge/server/service";
import { apiRoute } from "@/lib/api/route";

/** POST /api/v1/knowledge/resources/:id/concepts: { concept, explanation? } */
export const POST = apiRoute<{ id: string }>(async ({ tx, params, body }) => addConcept(tx, z.uuid().parse(params.id), await body(conceptSchema)), { status: 201 });
