import { z } from "zod";
import { applicationCreateSchema } from "@/features/psychology/schemas";
import { addApplication } from "@/features/psychology/server/service";
import { apiRoute } from "@/lib/api/route";

/** POST /api/v1/psychology/concepts/:id/applications: { context, action?, result?, outcome?, appliedOn? } */
export const POST = apiRoute<{ id: string }>(
  async ({ tx, params, body }) => addApplication(tx, z.uuid().parse(params.id), await body(applicationCreateSchema)),
  { status: 201 },
);
