import { z } from "zod";
import { parseRangeKey, type RangeKey } from "@/lib/domain/analytics";

const range = z
  .string()
  .default("30d")
  .transform((v, ctx) => {
    const key = parseRangeKey(v);
    if (!key) ctx.addIssue({ code: "custom", message: "Use 7d, 30d, 90d, 1y, journey or month:YYYY-MM." });
    return key as RangeKey;
  });

export const analyticsQuerySchema = z.object({ range });
export const exportQuerySchema = z.object({ range, format: z.enum(["csv", "pdf"]).default("csv") });
