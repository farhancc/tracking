import { exportQuerySchema } from "@/features/analytics/schemas";
import { exportCsv, exportPdf } from "@/features/analytics/server/export";
import { getAnalytics } from "@/features/analytics/server/service";
import { apiRoute } from "@/lib/api/route";

/** GET /api/v1/analytics/export?range=…&format=csv|pdf: a download of the same report. */
export const GET = apiRoute(async ({ tx, query }) => {
  const q = query(exportQuerySchema);
  const report = await getAnalytics(tx, q.range);
  const name = `fiveyearos-report-${report.range.from}-to-${report.range.to}.${q.format}`;
  const headers = { "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  if (q.format === "pdf") return new Response(Buffer.from(await exportPdf(report)), { headers: { ...headers, "Content-Type": "application/pdf" } });
  return new Response(`﻿${exportCsv(report)}`, { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8" } });
});
