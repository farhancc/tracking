import { z } from "zod";
import { skillUpdateSchema } from "@/features/communication/schemas";
import { getSkill, updateSkill } from "@/features/communication/server/service";
import { apiRoute } from "@/lib/api/route";

type Params = { key: string };
const key = z.string().regex(/^[a-z_]{2,40}$/);

/** GET /api/v1/communication/skills/:key: status, assessments, practice history, exercises, resources, recordings. */
export const GET = apiRoute<Params>(({ tx, params }) => getSkill(tx, key.parse(params.key)));

/** PATCH /api/v1/communication/skills/:key: { targetLevel?, description? } */
export const PATCH = apiRoute<Params>(async ({ tx, params, body }) => {
  const { skill } = await getSkill(tx, key.parse(params.key));
  return updateSkill(tx, skill.id, await body(skillUpdateSchema));
});
