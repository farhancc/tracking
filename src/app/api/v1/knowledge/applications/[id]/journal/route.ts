import { z } from "zod";
import { journalFromApplicationSchema } from "@/features/knowledge/schemas";
import { journalFromApplication } from "@/features/knowledge/server/service";
import { apiRoute } from "@/lib/api/route";

/** POST /api/v1/knowledge/applications/:id/journal: write it into the sales journal and link it */
export const POST = apiRoute<{ id: string }>(async ({ tx, params, body }) => journalFromApplication(tx, z.uuid().parse(params.id), await body(journalFromApplicationSchema)), {
  status: 201,
});
