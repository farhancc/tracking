/**
 * Content management service: brand positioning, pillars, items through the
 * pipeline, research sources, metric snapshots, idea library and calendar.
 */
import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { Tx } from "@/db/drizzle";
import { brandSettings, contentItems, contentMetrics, contentPillars, contentSources } from "@/db/schema";
import { requireWorkspace } from "@/features/goals/server/service";
import {
  CONTENT_STATUS_LABELS,
  CONTENT_STATUSES,
  DEFAULT_CONTENT_PILLARS,
  DEFAULT_POSITIONING,
  engagement,
  engagementRate,
  isPublished,
  mergeLatest,
  monthGrid,
  needsPlatform,
  nextStatus,
  PLATFORM_EXTRA_METRICS,
  statusIndex,
  type ContentStatus,
  type MetricSnapshot,
} from "@/lib/domain/content";
import { addDays } from "@/lib/domain/dates";
import { AppError, notFound } from "@/lib/errors";
import type { ItemCreateInput, ItemQuery, ItemUpdateInput, MetricInput } from "../schemas";

export type ContentItemRow = typeof contentItems.$inferSelect;
export type MetricRow = typeof contentMetrics.$inferSelect;

/** First use: the positioning from the plan and the seven default pillars (all editable). */
export async function ensureContentSetup(tx: Tx) {
  await tx.insert(brandSettings).values({ positioning: DEFAULT_POSITIONING }).onConflictDoNothing();
  const [{ n }] = await tx.select({ n: count() }).from(contentPillars);
  if (n === 0) {
    await tx.insert(contentPillars).values(DEFAULT_CONTENT_PILLARS.map((name, i) => ({ name, sortOrder: i })));
  }
}

export async function getBrand(tx: Tx) {
  await ensureContentSetup(tx);
  const [b] = await tx.select().from(brandSettings).limit(1);
  return b;
}

export async function setBrand(tx: Tx, input: { positioning: string; audience: string | null }) {
  await ensureContentSetup(tx);
  const [b] = await tx.update(brandSettings).set(input).where(eq(brandSettings.userId, sql`app.current_user_id()`)).returning();
  return b;
}

export async function listPillars(tx: Tx, includeArchived = false) {
  await ensureContentSetup(tx);
  return tx
    .select()
    .from(contentPillars)
    .where(includeArchived ? undefined : isNull(contentPillars.archivedAt))
    .orderBy(asc(contentPillars.sortOrder), asc(contentPillars.name));
}

export async function createPillar(tx: Tx, input: { name: string; description: string | null; sortOrder: number }) {
  const [row] = await tx.insert(contentPillars).values(input).returning();
  return row;
}

export async function updatePillar(tx: Tx, id: string, patch: { name?: string; description?: string | null; sortOrder?: number; archived?: boolean }) {
  const { archived, ...rest } = patch;
  const [row] = await tx
    .update(contentPillars)
    .set({ ...rest, ...(archived !== undefined ? { archivedAt: archived ? new Date() : null } : {}) })
    .where(eq(contentPillars.id, id))
    .returning();
  if (!row) throw notFound("Pillar");
  return row;
}

// ---------------------------------------------------------------------------
// Items

async function findItem(tx: Tx, id: string): Promise<ContentItemRow> {
  const [row] = await tx.select().from(contentItems).where(eq(contentItems.id, id)).limit(1);
  if (!row) throw notFound("Content item");
  return row;
}

/** Applies the pipeline rules and fills actual dates when a stage is reached. */
function applyPipeline(merged: ContentItemRow | (ItemCreateInput & Record<string, unknown>), prev: ContentStatus | null, today: string) {
  const m = merged as Record<string, unknown> & { status: ContentStatus };
  const idx = statusIndex(m.status);
  if (needsPlatform(m.status) && (!m.platform || !m.format)) {
    throw new AppError(422, "validation_failed", `Choose the platform and format before moving to ${CONTENT_STATUS_LABELS[m.status]}.`, {
      platform: ["Pick a platform and format."],
    });
  }
  // Passing Recording means it was recorded; record the date once.
  if (idx > statusIndex("recording") && !m.recordedOn && (prev == null || statusIndex(prev) <= statusIndex("recording"))) m.recordedOn = today;
  if (m.status === "scheduled" && !m.scheduledOn) {
    throw new AppError(422, "validation_failed", "Pick the date it is scheduled to go out.", { scheduledOn: ["Pick a date."] });
  }
  if (isPublished(m.status)) m.publishedOn = m.publishedOn ?? today;
  else m.publishedOn = null;
  if (m.status === "reviewed" && !String(m.reviewNotes ?? "").trim()) {
    throw new AppError(422, "validation_failed", "Write what you learned from the numbers before closing the review.", { reviewNotes: ["Write the lesson."] });
  }
  return m;
}

export async function createItem(tx: Tx, input: ItemCreateInput) {
  const ws = await requireWorkspace(tx);
  await ensureContentSetup(tx);
  const values = applyPipeline({ ...input }, null, ws.today);
  const [row] = await tx.insert(contentItems).values(values as typeof contentItems.$inferInsert).returning();
  return row;
}

const READ_ONLY = new Set(["id", "userId", "createdAt", "updatedAt", "archivedAt"]);

export async function updateItem(tx: Tx, id: string, patch: ItemUpdateInput) {
  const ws = await requireWorkspace(tx);
  const current = await findItem(tx, id);
  const { archived, ...rest } = patch;
  const merged = applyPipeline({ ...current, ...rest } as ContentItemRow, current.status, ws.today);
  const writable = Object.fromEntries(Object.entries(merged).filter(([k]) => !READ_ONLY.has(k))) as Partial<ContentItemRow>;
  const [row] = await tx
    .update(contentItems)
    .set({ ...writable, ...(archived !== undefined ? { archivedAt: archived ? new Date() : null } : {}) })
    .where(eq(contentItems.id, id))
    .returning();
  return row;
}

/** Moves to the next pipeline stage, applying the same rules. */
export async function advanceItem(tx: Tx, id: string) {
  const current = await findItem(tx, id);
  const next = nextStatus(current.status);
  if (!next) throw new AppError(409, "already_final", "The performance review is the last stage.");
  return updateItem(tx, id, { status: next });
}

/** A new version of an item for another platform, keeping the research and script. */
export async function repurposeItem(tx: Tx, id: string, input: { platform: ContentItemRow["platform"] & string; format: ContentItemRow["format"] & string; title: string | null }) {
  const src = await findItem(tx, id);
  const created = await createItem(tx, {
    title: input.title ?? src.title,
    topic: src.topic,
    pillarId: src.pillarId,
    platform: input.platform,
    format: input.format,
    status: "script",
    hook: src.hook,
    script: src.script,
    notes: null,
    plannedRecordOn: null,
    scheduledOn: null,
    recordedOn: null,
    publishedOn: null,
    publishedUrl: null,
    reviewNotes: null,
    repurposedFromId: src.id,
  });
  const sources = await tx.select().from(contentSources).where(eq(contentSources.itemId, id));
  if (sources.length) {
    await tx.insert(contentSources).values(sources.map((s) => ({ itemId: created.id, title: s.title, url: s.url, notes: s.notes })));
  }
  return created;
}

const toSnapshot = (m: MetricRow): MetricSnapshot => m;

/** Latest snapshot per item plus computed engagement. */
async function latestMetrics(tx: Tx, itemIds: string[]) {
  const out = new Map<string, { snapshot: MetricRow; engagement: number | null; engagementRate: ReturnType<typeof engagementRate> }>();
  if (!itemIds.length) return out;
  const rows = await tx.select().from(contentMetrics).where(inArray(contentMetrics.itemId, itemIds));
  const byItem = new Map<string, MetricRow[]>();
  for (const r of rows) byItem.set(r.itemId, [...(byItem.get(r.itemId) ?? []), r]);
  for (const [itemId, snaps] of byItem) {
    const merged = mergeLatest(snaps)!;
    out.set(itemId, { snapshot: merged, engagement: engagement(merged), engagementRate: engagementRate(toSnapshot(merged)) });
  }
  return out;
}

export async function listItems(tx: Tx, q: ItemQuery & { ideasOnly?: boolean }) {
  await ensureContentSetup(tx);
  const where: SQL[] = [isNull(contentItems.archivedAt)];
  if (q.status) where.push(eq(contentItems.status, q.status));
  if (q.ideasOnly || q.ideas === "true") where.push(inArray(contentItems.status, ["idea", "research"]));
  if (q.pillarId) where.push(eq(contentItems.pillarId, q.pillarId));
  if (q.platform) where.push(eq(contentItems.platform, q.platform));
  if (q.q) {
    const like = `%${q.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    where.push(or(ilike(contentItems.title, like), ilike(contentItems.topic, like), ilike(contentItems.hook, like))!);
  }
  const items = await tx
    .select()
    .from(contentItems)
    .where(and(...where))
    .orderBy(desc(contentItems.updatedAt))
    .limit(500);
  const metrics = await latestMetrics(
    tx,
    items.filter((i) => isPublished(i.status)).map((i) => i.id),
  );
  return items.map((i) => ({ ...i, latest: metrics.get(i.id) ?? null }));
}

export async function getItem(tx: Tx, id: string) {
  const ws = await requireWorkspace(tx);
  const item = await findItem(tx, id);
  const sources = await tx.select().from(contentSources).where(eq(contentSources.itemId, id)).orderBy(asc(contentSources.createdAt));
  const metrics = await tx.select().from(contentMetrics).where(eq(contentMetrics.itemId, id)).orderBy(desc(contentMetrics.capturedOn));
  const latest = mergeLatest(metrics);
  const versions = await tx
    .select({ id: contentItems.id, title: contentItems.title, platform: contentItems.platform, format: contentItems.format, status: contentItems.status })
    .from(contentItems)
    .where(and(eq(contentItems.repurposedFromId, id), isNull(contentItems.archivedAt)));
  const original = item.repurposedFromId
    ? ((await tx.select({ id: contentItems.id, title: contentItems.title, platform: contentItems.platform }).from(contentItems).where(eq(contentItems.id, item.repurposedFromId)).limit(1))[0] ?? null)
    : null;
  return {
    today: ws.today,
    item,
    sources,
    metrics,
    latest: latest ? { snapshot: latest, engagement: engagement(latest), engagementRate: engagementRate(latest) } : null,
    versions,
    original,
  };
}

export async function addSource(tx: Tx, itemId: string, input: { title: string; url: string | null; notes: string | null }) {
  await findItem(tx, itemId);
  const [row] = await tx.insert(contentSources).values({ ...input, itemId }).returning();
  return row;
}

export async function deleteSource(tx: Tx, id: string) {
  const [row] = await tx.delete(contentSources).where(eq(contentSources.id, id)).returning();
  if (!row) throw notFound("Source");
}

/** One snapshot per item and date: capturing the same day again corrects it. */
export async function recordMetrics(tx: Tx, itemId: string, input: MetricInput) {
  const ws = await requireWorkspace(tx);
  const item = await findItem(tx, itemId);
  const { capturedOn, notes, platformMetrics, ...counts } = input;
  // Keep only the extras this item's platform reports.
  const allowed = new Set((item.platform ? PLATFORM_EXTRA_METRICS[item.platform] : []).map((m) => m.key));
  const extras = Object.fromEntries(Object.entries(platformMetrics ?? {}).filter(([k]) => allowed.has(k)));
  const values = { itemId, capturedOn: capturedOn ?? ws.today, notes, platformMetrics: extras, ...counts };
  const [row] = await tx
    .insert(contentMetrics)
    .values(values)
    .onConflictDoUpdate({ target: [contentMetrics.itemId, contentMetrics.capturedOn], set: { ...counts, notes, platformMetrics: extras } })
    .returning();
  return row;
}

export async function deleteMetrics(tx: Tx, id: string) {
  const [row] = await tx.delete(contentMetrics).where(eq(contentMetrics.id, id)).returning();
  if (!row) throw notFound("Metrics");
}

// ---------------------------------------------------------------------------
// Overview and calendar

export async function getOverview(tx: Tx) {
  const ws = await requireWorkspace(tx);
  const brand = await getBrand(tx);
  const pillars = await listPillars(tx);
  const items = await listItems(tx, {});
  const counts = Object.fromEntries(CONTENT_STATUSES.map((s) => [s, 0])) as Record<ContentStatus, number>;
  for (const i of items) counts[i.status] += 1;
  const since = addDays(ws.today, -90);
  const published90 = items.filter((i) => i.publishedOn && i.publishedOn >= since);
  const pillarMix = pillars.map((p) => ({
    pillar: p,
    published90: published90.filter((i) => i.pillarId === p.id).length,
    inProgress: items.filter((i) => i.pillarId === p.id && !isPublished(i.status)).length,
  }));
  const upcoming = items
    .filter((i) => i.status === "scheduled" && i.scheduledOn && i.scheduledOn >= ws.today && i.scheduledOn <= addDays(ws.today, 14))
    .sort((a, b) => a.scheduledOn!.localeCompare(b.scheduledOn!));
  const overdue = items.filter((i) => i.status === "scheduled" && i.scheduledOn && i.scheduledOn < ws.today);
  const awaitingReview = items.filter((i) => i.status === "published" && i.publishedOn && i.publishedOn <= addDays(ws.today, -7));
  return { today: ws.today, brand, pillars, items, counts, pillarMix, upcoming, overdue, awaitingReview };
}

export async function getCalendar(tx: Tx, month?: string) {
  const ws = await requireWorkspace(tx);
  const m = `${month ?? ws.today.slice(0, 7)}-01`;
  const weeks = monthGrid(m, (ws.profile?.weekStartsOn ?? 1) === 0 ? 0 : 1);
  const from = weeks[0][0];
  const to = weeks.at(-1)!.at(-1)!;
  const inRange = (col: AnyPgColumn) => and(gte(col, from), lte(col, to));
  const items = await tx
    .select()
    .from(contentItems)
    .where(and(isNull(contentItems.archivedAt), or(inRange(contentItems.scheduledOn), inRange(contentItems.publishedOn), inRange(contentItems.plannedRecordOn))))
    .orderBy(asc(contentItems.title));
  const entries = items.flatMap((i) => {
    const out: { date: string; kind: "published" | "scheduled" | "record"; item: ContentItemRow }[] = [];
    if (i.publishedOn && i.publishedOn >= from && i.publishedOn <= to) out.push({ date: i.publishedOn, kind: "published", item: i });
    else if (i.scheduledOn && i.scheduledOn >= from && i.scheduledOn <= to) out.push({ date: i.scheduledOn, kind: "scheduled", item: i });
    if (!i.recordedOn && i.plannedRecordOn && i.plannedRecordOn >= from && i.plannedRecordOn <= to) out.push({ date: i.plannedRecordOn, kind: "record", item: i });
    return out;
  });
  return { today: ws.today, month: m, weeks, entries };
}

/** Published content for attribution pickers (e.g. "this lead came from…"). */
export async function listPublishedContent(tx: Tx) {
  return tx
    .select({ id: contentItems.id, title: contentItems.title, platform: contentItems.platform, publishedOn: contentItems.publishedOn })
    .from(contentItems)
    .where(and(isNull(contentItems.archivedAt), inArray(contentItems.status, ["published", "reviewed"])))
    .orderBy(desc(contentItems.publishedOn))
    .limit(200);
}
