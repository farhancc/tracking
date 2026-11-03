import { z } from "zod";
import { measurementCreateSchema } from "@/features/goals/schemas";
import { addMeasurement, listMeasurements } from "@/features/goals/server/service";
import { apiRoute } from "@/lib/api/route";

type Params = { id: string };

/** GET /api/v1/goals/:id/measurements: newest first. */
export const GET = apiRoute<Params>(({ tx, params }) => listMeasurements(tx, z.uuid().parse(params.id)));

/** POST /api/v1/goals/:id/measurements: log an outcome value; returns the measurement and the recomputed goal. */
export const POST = apiRoute<Params>(
  async ({ tx, params, body }) => addMeasurement(tx, z.uuid().parse(params.id), await body(measurementCreateSchema)),
  { status: 201 },
);
