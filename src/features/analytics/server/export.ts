/**
 * Report exports. CSV is one tidy table (one row per figure) so it opens in
 * any spreadsheet; the PDF is a printable report with the same figures, small
 * charts and the activity-vs-outcome reading.
 */
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { toCsv } from "@/lib/domain/analytics";
import type { AnalyticsReport, Chart, Section, Unit } from "./service";

const UNIT_LABEL: Record<Unit, string> = { count: "count", percent: "%", currency: "currency", minutes: "minutes", level: "level points" };

export function exportCsv(r: AnalyticsReport): string {
  const rows: (string | number | null)[][] = [["section", "kind", "metric", "period", "planned", "actual", "unit"]];
  const period = `${r.range.from}..${r.range.to}`;
  for (const s of r.sections) {
    const unit = (u: Unit) => (u === "currency" && s.currency ? s.currency : UNIT_LABEL[u]);
    for (const k of s.kpis) rows.push([s.title, "kpi", k.label, period, k.planned, k.actual, unit(k.unit)]);
    if (s.chart) {
      const planned = s.chart.series.filter((x) => x.kind === "planned");
      for (const row of s.chart.rows) {
        for (const series of s.chart.series.filter((x) => x.kind === "actual")) {
          // Pair an actual series with the planned one for the same measure when there is exactly one plan line.
          const plan = planned.length === 1 ? row[planned[0].key] : null;
          rows.push([s.title, "series", series.label, row.label, typeof plan === "number" ? plan : null, numberOrNull(row[series.key]), unit(s.chart.unit)]);
        }
      }
    }
    if (s.table) {
      for (const tr of s.table.rows) {
        s.table.columns.slice(1).forEach((col, i) => {
          const v = tr[i + 1];
          rows.push([s.title, "table", `${tr[0]} | ${col}`, period, null, typeof v === "number" ? v : v === null ? null : String(v), ""]);
        });
      }
    }
  }
  for (const p of r.outcomes.pairs) {
    const metric = `${p.area}: ${p.activityLabel} -> ${p.outcomeLabel}`;
    rows.push(["Activity vs outcome", "activity", metric, period, null, p.activity, "count"]);
    rows.push(["Activity vs outcome", "activity", metric, `${r.outcomes.previous.from}..${r.outcomes.previous.to}`, null, p.previousActivity, "count"]);
    rows.push(["Activity vs outcome", "outcome", metric, period, null, p.outcome, "count"]);
    rows.push(["Activity vs outcome", "outcome", metric, `${r.outcomes.previous.from}..${r.outcomes.previous.to}`, null, p.previousOutcome, "count"]);
    rows.push(["Activity vs outcome", "verdict", metric, period, null, p.text, ""]);
  }
  return toCsv(rows);
}

const numberOrNull = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

// ---------------------------------------------------------------------------
// PDF

const A4 = { w: 595.28, h: 841.89 };
const M = 40;
const INK = rgb(0.1, 0.1, 0.12);
const MUTED = rgb(0.42, 0.45, 0.5);
const RULE = rgb(0.86, 0.87, 0.9);
// Colour follows meaning: planned is neutral grey; actual series use the app's chart hues in fixed order.
const PLANNED = rgb(0.62, 0.65, 0.7);
const ACTUAL: RGB[] = [rgb(0x2a / 255, 0x78 / 255, 0xd6 / 255), rgb(0xeb / 255, 0x68 / 255, 0x34 / 255), rgb(0x19 / 255, 0x9e / 255, 0x70 / 255)];

/** Standard PDF fonts only cover Windows-1252, so map common symbols and drop the rest. */
function safe(text: string): string {
  return text
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/→/g, "->")
    .replace(/≥/g, ">=")
    .replace(/≤/g, "<=")
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7E\xA0-\xFF\n]/g, "?");
}

function fmt(v: number | string | null | undefined, unit?: Unit, currency?: string | null): string {
  if (v === null || v === undefined || v === "") return "-";
  if (typeof v === "string") return v;
  const n = Math.abs(v) >= 1000 ? Math.round(v).toLocaleString("en-US") : String(Math.round(v * 10) / 10);
  if (unit === "percent") return `${n}%`;
  if (unit === "currency" && currency) return `${currency} ${n}`;
  return n;
}

class Writer {
  page!: PDFPage;
  y = 0;
  constructor(
    private doc: PDFDocument,
    private font: PDFFont,
    private bold: PDFFont,
    private footer: string,
  ) {
    this.newPage();
  }
  newPage() {
    this.page = this.doc.addPage([A4.w, A4.h]);
    this.y = A4.h - M;
    this.page.drawText(safe(this.footer), { x: M, y: 20, size: 8, font: this.font, color: MUTED });
  }
  ensure(h: number) {
    if (this.y - h < M) this.newPage();
  }
  wrap(text: string, size: number, width: number, font = this.font) {
    const lines: string[] = [];
    for (const para of safe(text).split("\n")) {
      let line = "";
      for (const word of para.split(/\s+/)) {
        const next = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(next, size) > width && line) {
          lines.push(line);
          line = word;
        } else line = next;
      }
      lines.push(line);
    }
    return lines;
  }
  text(text: string, opts: { size?: number; bold?: boolean; color?: RGB; gap?: number; indent?: number } = {}) {
    const size = opts.size ?? 9.5;
    const font = opts.bold ? this.bold : this.font;
    const x = M + (opts.indent ?? 0);
    for (const line of this.wrap(text, size, A4.w - x - M, font)) {
      this.ensure(size + 3);
      this.y -= size + 3;
      this.page.drawText(line, { x, y: this.y, size, font, color: opts.color ?? INK });
    }
    this.y -= opts.gap ?? 2;
  }
  rule() {
    this.ensure(8);
    this.y -= 6;
    this.page.drawLine({ start: { x: M, y: this.y }, end: { x: A4.w - M, y: this.y }, thickness: 0.5, color: RULE });
    this.y -= 4;
  }
  table(columns: string[], rows: (string | number | null)[][], widths?: number[], size = 8) {
    const total = A4.w - 2 * M;
    const w = widths ?? columns.map((_, i) => (i === 0 ? total * 0.34 : (total * 0.66) / (columns.length - 1)));
    const drawRow = (cells: string[], font: PDFFont, color: RGB, alignRight: boolean[]) => {
      const wrapped = cells.map((c, i) => this.wrap(c, size, w[i] - 6, font).slice(0, 3));
      const h = Math.max(...wrapped.map((l) => l.length)) * (size + 2) + 4;
      this.ensure(h);
      let x = M;
      wrapped.forEach((lines, i) => {
        lines.forEach((line, j) => {
          const right = alignRight?.[i] ?? false;
          const lw = font.widthOfTextAtSize(line, size);
          this.page.drawText(line, { x: right ? x + w[i] - 3 - lw : x + 2, y: this.y - (j + 1) * (size + 2), size, font, color });
        });
        x += w[i];
      });
      this.y -= h;
    };
    // Headers of number columns line up with their right-aligned values.
    const numeric = columns.map((_, i) => i > 0 && rows.length > 0 && rows.every((r) => r[i] === null || typeof r[i] === "number" || /^[-\d.,%A-Z ]+$/.test(String(r[i]))));
    drawRow(columns, this.bold, MUTED, numeric);
    this.page.drawLine({ start: { x: M, y: this.y + 1 }, end: { x: A4.w - M, y: this.y + 1 }, thickness: 0.5, color: RULE });
    for (const r of rows) drawRow(r.map((c) => (typeof c === "number" ? fmt(c) : (c ?? "-"))), this.font, INK, numeric);
    this.y -= 4;
  }
  /** A small chart: bars and/or lines on one axis starting at zero, with a legend. */
  chart(c: Chart, currency: string | null) {
    const H = 110;
    const W = A4.w - 2 * M;
    this.ensure(H + 34);
    const top = this.y - 6;
    const base = top - H;
    const values = c.rows.flatMap((r) => c.series.map((s) => r[s.key])).filter((v): v is number => typeof v === "number");
    const max = Math.max(1, ...values);
    const min = Math.min(0, ...values);
    const yOf = (v: number) => base + ((v - min) / (max - min)) * H;
    const n = c.rows.length;
    const slot = W / Math.max(1, n);
    this.page.drawLine({ start: { x: M, y: yOf(0) }, end: { x: M + W, y: yOf(0) }, thickness: 0.5, color: RULE });
    this.page.drawText(safe(fmt(max, c.unit, currency)), { x: M, y: top + 2, size: 7, font: this.font, color: MUTED });
    const bars = c.series.filter((s) => s.type === "bar");
    const lines = c.series.filter((s) => s.type === "line");
    const colorOf = (key: string) => {
      const s = c.series.find((x) => x.key === key)!;
      if (s.kind === "planned") return PLANNED;
      return ACTUAL[c.series.filter((x) => x.kind === "actual").indexOf(s) % ACTUAL.length];
    };
    const bw = Math.min(22, Math.max(1, (slot * 0.7) / Math.max(1, bars.length)));
    c.rows.forEach((r, i) => {
      bars.forEach((s, j) => {
        const v = r[s.key];
        if (typeof v !== "number") return;
        const x = M + i * slot + (slot - bw * bars.length) / 2 + j * bw;
        const y0 = yOf(0);
        const y1 = yOf(v);
        this.page.drawRectangle({ x, y: Math.min(y0, y1), width: Math.max(0.6, bw - 1), height: Math.max(0.3, Math.abs(y1 - y0)), color: colorOf(s.key) });
      });
    });
    for (const s of lines) {
      let prev: { x: number; y: number } | null = null;
      c.rows.forEach((r, i) => {
        const v = r[s.key];
        if (typeof v !== "number") {
          prev = null;
          return;
        }
        const pt = { x: M + i * slot + slot / 2, y: yOf(v) };
        if (prev) this.page.drawLine({ start: prev, end: pt, thickness: 1.5, color: colorOf(s.key), dashArray: s.kind === "planned" ? [3, 2] : undefined });
        else if (n === 1) this.page.drawCircle({ x: pt.x, y: pt.y, size: 2, color: colorOf(s.key) });
        prev = pt;
      });
    }
    // First and last period labels, and a legend.
    const first = safe(c.rows[0]?.label ?? "");
    const last = safe(c.rows.at(-1)?.label ?? "");
    this.page.drawText(first, { x: M, y: base - 10, size: 7, font: this.font, color: MUTED });
    if (n > 1) this.page.drawText(last, { x: M + W - this.font.widthOfTextAtSize(last, 7), y: base - 10, size: 7, font: this.font, color: MUTED });
    let lx = M;
    for (const s of c.series) {
      this.page.drawRectangle({ x: lx, y: base - 22, width: 8, height: 6, color: colorOf(s.key) });
      const label = safe(s.label);
      this.page.drawText(label, { x: lx + 11, y: base - 22, size: 7, font: this.font, color: INK });
      lx += 20 + this.font.widthOfTextAtSize(label, 7);
    }
    this.y = base - 30;
  }
}

function sectionPdf(w: Writer, s: Section) {
  w.rule();
  w.text(s.title, { size: 13, bold: true, gap: 1 });
  w.text(s.question, { size: 8.5, color: MUTED, gap: 4 });
  if (!s.hasData) {
    w.text("No data recorded in this period.", { color: MUTED, gap: 4 });
    for (const n of s.notes) w.text(n, { size: 7.5, color: MUTED });
    return;
  }
  w.table(
    ["Measure", "Planned", "Actual"],
    s.kpis.map((k) => [k.note ? `${k.label} (${k.note})` : k.label, fmt(k.planned, k.unit, s.currency), fmt(k.actual, k.unit, s.currency)]),
    [(A4.w - 2 * M) * 0.64, (A4.w - 2 * M) * 0.18, (A4.w - 2 * M) * 0.18],
  );
  if (s.chart && s.chart.rows.length) w.chart(s.chart, s.currency);
  if (s.table && s.table.rows.length) w.table(s.table.columns, s.table.rows.slice(0, 40));
  if (s.table && s.table.rows.length > 40) w.text(`… ${s.table.rows.length - 40} more rows in the CSV export.`, { size: 7.5, color: MUTED });
  for (const n of s.notes) w.text(n, { size: 7.5, color: MUTED });
}

export async function exportPdf(r: AnalyticsReport, generatedAt = new Date()): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`FiveYearOS report ${r.range.from} to ${r.range.to}`);
  doc.setProducer("FiveYearOS");
  doc.setCreationDate(generatedAt);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const w = new Writer(doc, font, bold, `FiveYearOS · ${r.range.label} (${r.range.from} to ${r.range.to}) · generated ${generatedAt.toISOString().slice(0, 16).replace("T", " ")} UTC`);

  w.text("Progress report", { size: 20, bold: true, gap: 2 });
  w.text(`${r.range.label}: ${r.range.from} to ${r.range.to}. Journey ${r.journey.startDate} to ${r.journey.endDate}.`, { color: MUTED, gap: 6 });
  w.text("Actual figures come only from what you recorded. Planned figures are what you set: goal pace, targets, schedules and forecasts. A dash means nothing was planned or recorded.", { size: 8.5, color: MUTED, gap: 6 });

  w.rule();
  w.text("Is activity turning into outcomes?", { size: 13, bold: true, gap: 4 });
  w.table(
    ["Area", "Activity (now / before)", "Outcome (now / before)", "Reading"],
    r.outcomes.pairs.map((p) => [p.area, `${p.activityLabel}: ${fmt(p.activity)} / ${fmt(p.previousActivity)}`, `${p.outcomeLabel}: ${fmt(p.outcome)} / ${fmt(p.previousOutcome)}`, p.text]),
    [(A4.w - 2 * M) * 0.13, (A4.w - 2 * M) * 0.27, (A4.w - 2 * M) * 0.27, (A4.w - 2 * M) * 0.33],
  );
  w.text(`"Before" = ${r.outcomes.previous.from} to ${r.outcomes.previous.to}. ${r.outcomes.caveat}`, { size: 7.5, color: MUTED });

  for (const s of r.sections) sectionPdf(w, s);
  return doc.save();
}
