import { z } from "zod";
import { linkCreateSchema } from "@/features/goals/schemas";
import { addLink } from "@/features/goals/server/service";
import { apiRoute } from "@/lib/api/route";

/** POST /api/v1/goals/:id/links: relate two goals (symmetric). */
export const POST = apiRoute<{ id: string }>(
  async ({ tx, params, body }) => addLink(tx, z.uuid().parse(params.id), await body(linkCreateSchema)),
  { status: 201 },
);
