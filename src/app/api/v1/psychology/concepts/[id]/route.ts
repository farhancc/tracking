import { z } from "zod";
import { conceptUpdateSchema } from "@/features/psychology/schemas";
import { getConcept, updateConcept } from "@/features/psychology/server/service";
import { apiRoute } from "@/lib/api/route";

type Params = { id: string };

/** GET /api/v1/psychology/concepts/:id: concept, review history, applications, deep-understanding check */
export const GET = apiRoute<Params>(({ tx, params }) => getConcept(tx, z.uuid().parse(params.id)));

/** PATCH /api/v1/psychology/concepts/:id: "understanding: deep" fails with 422 until earned */
export const PATCH = apiRoute<Params>(async ({ tx, params, body }) => updateConcept(tx, z.uuid().parse(params.id), await body(conceptUpdateSchema)));
