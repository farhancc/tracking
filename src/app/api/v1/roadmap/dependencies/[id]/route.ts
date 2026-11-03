import { z } from "zod";
import { quarterDependencyUpdateSchema } from "@/features/roadmap/schemas";
import { deleteQuarterDependency, updateQuarterDependency } from "@/features/roadmap/server/service";
import { apiRoute } from "@/lib/api/route";

type Params = { id: string };

/** PATCH /api/v1/roadmap/dependencies/:id */
export const PATCH = apiRoute<Params>(async ({ tx, params, body }) => updateQuarterDependency(tx, z.uuid().parse(params.id), await body(quarterDependencyUpdateSchema)));

/** DELETE /api/v1/roadmap/dependencies/:id */
export const DELETE = apiRoute<Params>(({ tx, params }) => deleteQuarterDependency(tx, z.uuid().parse(params.id)));
