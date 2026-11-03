import { z } from "zod";
import { deleteMeasurement } from "@/features/goals/server/service";
import { apiRoute } from "@/lib/api/route";

/** DELETE /api/v1/goals/:id/measurements/:measurementId: returns the recomputed goal. */
export const DELETE = apiRoute<{ id: string; measurementId: string }>(({ tx, params }) =>
  deleteMeasurement(tx, z.uuid().parse(params.id), z.uuid().parse(params.measurementId)),
);
