import { z } from "zod";
import { metricSchema, type MetricInput } from "@/features/content/schemas";
import { recordMetrics } from "@/features/content/server/service";
import { apiRoute } from "@/lib/api/route";

/** POST /api/v1/content/items/:id/metrics: a snapshot from the platform's insights (upsert by capturedOn) */
export const POST = apiRoute<{ id: string }>(
  async ({ tx, params, body }) => recordMetrics(tx, z.uuid().parse(params.id), (await body(metricSchema)) as MetricInput),
  { status: 201 },
);
