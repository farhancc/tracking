import { quarterNumberSchema, quarterUpdateSchema } from "@/features/roadmap/schemas";
import { getQuarter, updateQuarter } from "@/features/roadmap/server/service";
import { apiRoute } from "@/lib/api/route";

type Params = { quarter: string };

/** GET /api/v1/roadmap/quarters/:quarter (1–20): objectives with key results, artefacts, assessment, planned vs actual. */
export const GET = apiRoute<Params>(async ({ tx, params }) => {
  const { workspace, ...detail } = await getQuarter(tx, quarterNumberSchema.parse(params.quarter));
  return { today: workspace.today, ...detail };
});

/** PATCH /api/v1/roadmap/quarters/:quarter: { focus?, capacityHoursPerWeek?, midReviewOn?, reviewOn?, reviewSummary?, reviewed? } */
export const PATCH = apiRoute<Params>(async ({ tx, params, body }) =>
  updateQuarter(tx, quarterNumberSchema.parse(params.quarter), await body(quarterUpdateSchema)),
);
