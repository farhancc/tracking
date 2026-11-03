import { z } from "zod";
import { deleteForecast } from "@/features/finance/server/service";
import { apiRoute } from "@/lib/api/route";

/** DELETE /api/v1/finance/forecasts/:id */
export const DELETE = apiRoute<{ id: string }>(({ tx, params }) => deleteForecast(tx, z.uuid().parse(params.id)));
