import { z } from "zod";
import { applicationCreateSchema } from "@/features/knowledge/schemas";
import { addApplication } from "@/features/knowledge/server/service";
import { apiRoute } from "@/lib/api/route";

/** POST /api/v1/knowledge/resources/:id/applications: { description, conceptId?, createTask?, journalEntryId? } */
export const POST = apiRoute<{ id: string }>(async ({ tx, params, body }) => addApplication(tx, z.uuid().parse(params.id), await body(applicationCreateSchema)), {
  status: 201,
});
