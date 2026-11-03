/**
 * Sales mastery service: tracks, prospects, activities, deals, targets,
 * dashboard metrics and the learning journal.
 */
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lte, notInArray, or, sql, type SQL } from "drizzle-orm";
import type { Tx } from "@/db/drizzle";
import { deals, prospects, salesActivities, salesJournalEntries, salesTargets, salesTracks } from "@/db/schema";
import { requireWorkspace } from "@/features/goals/server/service";
import {
  OPEN_DEAL_STAGES,
  SALES_METRICS,
  advanceProspectStatus,
  outcomeFlags,
  periodLabel,
  periodRange,
  salesMetrics,
  shiftPeriod,
  targetAttainment,
  type ActivityFact,
  type DealFact,
  type DealStage,
  type ProspectStatus,
  type Range,
  type SalesMetric,
  type SalesPeriod,
} from "@/lib/domain/sales";
import { AppError, notFound } from "@/lib/errors";
import type {
  ActivityCreateInput,
  DealCreateInput,
  DealUpdateInput,
  JournalCreateInput,
  ProspectCreateInput,
  TargetSetInput,
} from "../schemas";

export type TrackRow = typeof salesTracks.$inferSelect;
export type ProspectRow = typeof prospects.$inferSelect;
export type DealRow = typeof deals.$inferSelect;
export type ActivityRow = typeof salesActivities.$inferSelect;

// ---------------------------------------------------------------------------
// Tracks
// ---------------------------------------------------------------------------

export async function listTracks(tx: Tx): Promise<TrackRow[]> {
  return tx.select().from(salesTracks).where(isNull(salesTracks.archivedAt)).orderBy(desc(salesTracks.isDefault), asc(salesTracks.name));
}

/** Every owner gets a default track in their base currency on first use. */
export async function ensureDefaultTrack(tx: Tx): Promise<TrackRow> {
  const [existing] = await tx.select().from(salesTracks).where(and(eq(salesTracks.isDefault, true), isNull(salesTracks.archivedAt))).limit(1);
  if (existing) return existing;
  const [any] = await tx.select().from(salesTracks).where(isNull(salesTracks.archivedAt)).orderBy(asc(salesTracks.createdAt)).limit(1);
  if (any) {
    const [row] = await tx.update(salesTracks).set({ isDefault: true }).where(eq(salesTracks.id, any.id)).returning();
    return row;
  }
  const ws = await requireWorkspace(tx);
  const [row] = await tx.insert(salesTracks).values({ name: "My sales", currency: ws.baseCurrency, isDefault: true }).returning();
  return row;
}

export async function createTrack(tx: Tx, input: { name: string; currency: string; description: string | null; isDefault: boolean }) {
  if (input.isDefault) await tx.update(salesTracks).set({ isDefault: false }).where(eq(salesTracks.isDefault, true));
  const [row] = await tx.insert(salesTracks).values(input).returning();
  return row;
}

export async function updateTrack(tx: Tx, id: string, patch: { name?: string; currency?: string; description?: string | null; isDefault?: boolean; archived?: boolean }) {
  const { archived, ...rest } = patch;
  if (rest.isDefault) await tx.update(salesTracks).set({ isDefault: false }).where(eq(salesTracks.isDefault, true));
  const [row] = await tx
    .update(salesTracks)
    .set({ ...rest, ...(archived !== undefined ? { archivedAt: archived ? new Date() : null, ...(archived ? { isDefault: false } : {}) } : {}) })
    .where(eq(salesTracks.id, id))
    .returning();
  if (!row) throw notFound("Sales track");
  return row;
}

async function resolveTrack(tx: Tx, trackId: string | null | undefined): Promise<TrackRow> {
  if (!trackId) return ensureDefaultTrack(tx);
  const [t] = await tx.select().from(salesTracks).where(eq(salesTracks.id, trackId)).limit(1);
  if (!t) throw notFound("Sales track");
  return t;
}

// ---------------------------------------------------------------------------
// Prospects
// ---------------------------------------------------------------------------

async function findProspect(tx: Tx, id: string): Promise<ProspectRow> {
  const [p] = await tx.select().from(prospects).where(eq(prospects.id, id)).limit(1);
  if (!p) throw notFound("Prospect");
  return p;
}

export async function listProspects(tx: Tx, filter: { trackId?: string; status?: string; q?: string } = {}) {
  const where: SQL[] = [isNull(prospects.archivedAt)];
  if (filter.trackId) where.push(eq(prospects.trackId, filter.trackId));
  if (filter.status) where.push(eq(prospects.status, filter.status as ProspectStatus));
  if (filter.q) where.push(or(ilike(prospects.name, `%${filter.q}%`), ilike(prospects.company, `%${filter.q}%`))!);
  return tx.select().from(prospects).where(and(...where)).orderBy(asc(prospects.nextFollowUpOn), asc(prospects.name));
}

export async function createProspect(tx: Tx, input: ProspectCreateInput) {
  const track = await resolveTrack(tx, input.trackId);
  const [row] = await tx.insert(prospects).values({ ...input, trackId: track.id }).returning();
  return row;
}

export async function updateProspect(tx: Tx, id: string, patch: Partial<ProspectCreateInput> & { archived?: boolean }) {
  const { archived, trackId, ...rest } = patch;
  const set: Partial<typeof prospects.$inferInsert> = { ...rest };
  if (trackId) set.trackId = (await resolveTrack(tx, trackId)).id;
  if (archived !== undefined) set.archivedAt = archived ? new Date() : null;
  const [row] = await tx.update(prospects).set(set).where(eq(prospects.id, id)).returning();
  if (!row) throw notFound("Prospect");
  return row;
}

async function advanceProspect(tx: Tx, prospectId: string | null, reached: ProspectStatus) {
  if (!prospectId) return;
  const p = await findProspect(tx, prospectId);
  const next = advanceProspectStatus(p.status as ProspectStatus, reached);
  if (next !== p.status) await tx.update(prospects).set({ status: next }).where(eq(prospects.id, p.id));
}

// ---------------------------------------------------------------------------
// Deals
// ---------------------------------------------------------------------------

async function findDeal(tx: Tx, id: string): Promise<DealRow> {
  const [d] = await tx.select().from(deals).where(eq(deals.id, id)).limit(1);
  if (!d) throw notFound("Deal");
  return d;
}

export async function listDeals(tx: Tx, filter: { trackId?: string; open?: boolean } = {}) {
  const where: SQL[] = [];
  if (filter.trackId) where.push(eq(deals.trackId, filter.trackId));
  if (filter.open) where.push(inArray(deals.stage, OPEN_DEAL_STAGES));
  return tx
    .select({ deal: deals, prospectName: prospects.name, prospectCompany: prospects.company })
    .from(deals)
    .leftJoin(prospects, eq(prospects.id, deals.prospectId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(asc(deals.expectedCloseOn), desc(deals.updatedAt));
}

function closeFields(stage: DealStage | undefined, closedOn: string | null | undefined, today: string) {
  if (!stage) return {};
  if (stage === "won" || stage === "lost") return { closedOn: closedOn ?? today };
  return { closedOn: null, lostReason: null };
}

export async function createDeal(tx: Tx, input: DealCreateInput) {
  const ws = await requireWorkspace(tx);
  const prospect = input.prospectId ? await findProspect(tx, input.prospectId) : null;
  const track = await resolveTrack(tx, input.trackId ?? prospect?.trackId);
  const [row] = await tx
    .insert(deals)
    .values({ ...input, trackId: track.id, currency: input.currency ?? track.currency, ...closeFields(input.stage, input.closedOn, ws.today) })
    .returning();
  if (prospect) await advanceProspect(tx, prospect.id, input.stage === "won" ? "won" : input.stage === "proposal" ? "proposal" : input.stage === "meeting" ? "meeting" : "qualified");
  return row;
}

export async function updateDeal(tx: Tx, id: string, patch: DealUpdateInput) {
  const ws = await requireWorkspace(tx);
  const current = await findDeal(tx, id);
  const { trackId, currency, ...rest } = patch;
  const set: Partial<typeof deals.$inferInsert> = {
    ...rest,
    ...(currency ? { currency } : {}),
    ...closeFields(patch.stage, patch.closedOn ?? current.closedOn, ws.today),
  };
  if (trackId) set.trackId = (await resolveTrack(tx, trackId)).id;
  if (patch.stage === "won" && (patch.amount ?? current.amount) === null) {
    throw new AppError(422, "won_without_amount", "Enter the deal amount to mark it won.", { amount: ["Required for a won deal."] });
  }
  const [row] = await tx.update(deals).set(set).where(eq(deals.id, id)).returning();
  if (row.prospectId && patch.stage) {
    if (patch.stage === "lost") await tx.update(prospects).set({ status: "lost" }).where(eq(prospects.id, row.prospectId));
    else await advanceProspect(tx, row.prospectId, patch.stage === "won" ? "won" : patch.stage === "qualified" ? "qualified" : patch.stage === "meeting" ? "meeting" : "proposal");
  }
  return row;
}

// ---------------------------------------------------------------------------
// Activities
// ---------------------------------------------------------------------------

export async function logActivity(tx: Tx, input: ActivityCreateInput): Promise<ActivityRow> {
  const ws = await requireWorkspace(tx);
  const prospect = input.prospectId ? await findProspect(tx, input.prospectId) : null;
  let deal = input.dealId ? await findDeal(tx, input.dealId) : null;
  // A quotation for a prospect with exactly one open deal belongs to that deal.
  if (!deal && prospect && input.kind === "quotation") {
    const open = await tx
      .select()
      .from(deals)
      .where(and(eq(deals.prospectId, prospect.id), inArray(deals.stage, OPEN_DEAL_STAGES)))
      .limit(2);
    if (open.length === 1) deal = open[0];
  }
  const track = await resolveTrack(tx, input.trackId ?? deal?.trackId ?? prospect?.trackId);

  const flags = input.outcome
    ? outcomeFlags(input.outcome)
    : {
        connected: input.connected || input.reachedDecisionMaker || input.qualified || input.meetingBooked,
        reachedDecisionMaker: input.reachedDecisionMaker,
        qualified: input.qualified,
        meetingBooked: input.meetingBooked,
      };

  const occurredOn = input.occurredOn ?? ws.today;
  const currency = input.kind === "quotation" ? (input.currency ?? deal?.currency ?? track.currency) : null;

  // A quotation always belongs to a deal: use the given one, or open one for the prospect.
  if (input.kind === "quotation") {
    if (!deal) {
      const [created] = await tx
        .insert(deals)
        .values({
          trackId: track.id,
          prospectId: prospect?.id ?? null,
          title: prospect ? `Quotation for ${prospect.company ?? prospect.name}` : "Quotation",
          stage: "proposal",
          amount: input.amount,
          currency: currency!,
          quotedOn: occurredOn,
        })
        .returning();
      deal = created;
    } else if (OPEN_DEAL_STAGES.indexOf(deal.stage as DealStage) < OPEN_DEAL_STAGES.indexOf("proposal") || deal.amount === null) {
      [deal] = await tx
        .update(deals)
        .set({
          stage: OPEN_DEAL_STAGES.indexOf(deal.stage as DealStage) < OPEN_DEAL_STAGES.indexOf("proposal") ? "proposal" : deal.stage,
          amount: deal.amount ?? input.amount,
          quotedOn: deal.quotedOn ?? occurredOn,
        })
        .where(eq(deals.id, deal.id))
        .returning();
    }
  }

  const [row] = await tx
    .insert(salesActivities)
    .values({
      trackId: track.id,
      prospectId: prospect?.id ?? deal?.prospectId ?? null,
      dealId: deal?.id ?? null,
      kind: input.kind,
      channel: input.channel ?? (input.kind === "cold_call" ? "phone" : input.kind === "prospecting" ? "email" : "other"),
      occurredOn,
      ...flags,
      amount: input.kind === "quotation" ? input.amount : null,
      currency,
      durationMinutes: input.durationMinutes,
      notes: input.notes,
    })
    .returning();

  const prospectId = row.prospectId;
  if (prospectId) {
    const reached: ProspectStatus =
      input.kind === "quotation" ? "proposal" : flags.meetingBooked ? "meeting" : flags.qualified ? "qualified" : flags.connected ? "connected" : "contacted";
    await advanceProspect(tx, prospectId, reached);
  }
  return row;
}

export async function deleteActivity(tx: Tx, id: string) {
  const rows = await tx.delete(salesActivities).where(eq(salesActivities.id, id)).returning({ id: salesActivities.id });
  if (rows.length === 0) throw notFound("Activity");
}

export async function listActivities(tx: Tx, filter: { from?: string; to?: string; trackId?: string; prospectId?: string; limit?: number }) {
  const where: SQL[] = [];
  if (filter.from) where.push(gte(salesActivities.occurredOn, filter.from));
  if (filter.to) where.push(lte(salesActivities.occurredOn, filter.to));
  if (filter.trackId) where.push(eq(salesActivities.trackId, filter.trackId));
  if (filter.prospectId) where.push(eq(salesActivities.prospectId, filter.prospectId));
  return tx
    .select({ activity: salesActivities, prospectName: prospects.name })
    .from(salesActivities)
    .leftJoin(prospects, eq(prospects.id, salesActivities.prospectId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(salesActivities.occurredAt))
    .limit(filter.limit ?? 200);
}

// ---------------------------------------------------------------------------
// Targets
// ---------------------------------------------------------------------------

/** Effective-dated: raising a target later never changes how earlier periods are judged. */
export async function setTarget(tx: Tx, input: TargetSetInput) {
  const ws = await requireWorkspace(tx);
  await resolveTrack(tx, input.trackId);
  const effectiveFrom = input.effectiveFrom ?? periodRange(input.period, ws.today, ws.weekStartsOn).start;
  if (input.targetValue === null) {
    await tx
      .delete(salesTargets)
      .where(and(eq(salesTargets.trackId, input.trackId), eq(salesTargets.metric, input.metric), eq(salesTargets.period, input.period), gte(salesTargets.effectiveFrom, effectiveFrom)));
    return null;
  }
  const [row] = await tx
    .insert(salesTargets)
    .values({ trackId: input.trackId, metric: input.metric, period: input.period, targetValue: input.targetValue, effectiveFrom })
    .onConflictDoUpdate({ target: [salesTargets.trackId, salesTargets.metric, salesTargets.period, salesTargets.effectiveFrom], set: { targetValue: input.targetValue } })
    .returning();
  return row;
}

async function targetsFor(tx: Tx, trackId: string, period: SalesPeriod, on: string): Promise<Partial<Record<SalesMetric, number>>> {
  const rows = await tx
    .select()
    .from(salesTargets)
    .where(and(eq(salesTargets.trackId, trackId), eq(salesTargets.period, period), lte(salesTargets.effectiveFrom, on)))
    .orderBy(desc(salesTargets.effectiveFrom));
  const out: Partial<Record<SalesMetric, number>> = {};
  for (const r of rows) if (out[r.metric as SalesMetric] === undefined) out[r.metric as SalesMetric] = r.targetValue;
  return out;
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

const TREND_PERIODS = 8;

export async function getDashboard(tx: Tx, query: { period: SalesPeriod; anchor?: string; trackId?: string }) {
  const ws = await requireWorkspace(tx);
  await ensureDefaultTrack(tx);
  const tracks = await listTracks(tx);
  const track = query.trackId ? tracks.find((t) => t.id === query.trackId) : null;
  if (query.trackId && !track) throw notFound("Sales track");

  const range = periodRange(query.period, query.anchor ?? ws.today, ws.weekStartsOn);
  const ranges: Range[] = Array.from({ length: TREND_PERIODS }, (_, i) => shiftPeriod(query.period, range, i - (TREND_PERIODS - 1), ws.weekStartsOn));
  const windowStart = ranges[0].start;

  const trackWhere = track ? [eq(salesActivities.trackId, track.id)] : [];
  const activityRows = await tx
    .select({
      kind: salesActivities.kind,
      connected: salesActivities.connected,
      reachedDecisionMaker: salesActivities.reachedDecisionMaker,
      qualified: salesActivities.qualified,
      meetingBooked: salesActivities.meetingBooked,
      occurredOn: salesActivities.occurredOn,
    })
    .from(salesActivities)
    .where(and(gte(salesActivities.occurredOn, windowStart), lte(salesActivities.occurredOn, range.end), ...trackWhere));
  const closedRows = await tx
    .select({ stage: deals.stage, amount: deals.amount, currency: deals.currency, closedOn: deals.closedOn })
    .from(deals)
    .where(and(gte(deals.closedOn, windowStart), lte(deals.closedOn, range.end), ...(track ? [eq(deals.trackId, track.id)] : [])));

  const bucket = (r: Range) => {
    const acts: ActivityFact[] = activityRows.filter((a) => a.occurredOn >= r.start && a.occurredOn <= r.end);
    const closed: DealFact[] = closedRows.filter((d) => d.closedOn! >= r.start && d.closedOn! <= r.end).map((d) => ({ stage: d.stage as DealStage, amount: d.amount, currency: d.currency }));
    return salesMetrics(acts, closed);
  };

  const current = bucket(range);
  const previous = bucket(ranges[TREND_PERIODS - 2]);
  const targets = track ? await targetsFor(tx, track.id, query.period, range.start) : {};
  const metrics = SALES_METRICS.map((metric) => {
    const actual = metric === "revenue" ? (track ? (current.counts.revenue[track.currency] ?? 0) : null) : current.counts[metric];
    const prev = metric === "revenue" ? (track ? (previous.counts.revenue[track.currency] ?? 0) : null) : previous.counts[metric];
    const target = targets[metric] ?? null;
    return { metric, actual, previous: prev, target, attainment: actual === null ? null : targetAttainment(metric, actual, target) };
  });

  const trend = ranges.map((r) => {
    const m = bucket(r);
    return {
      start: r.start,
      label: query.period === "day" ? r.start.slice(5) : query.period === "week" ? r.start.slice(5) : periodLabel(query.period, r).replace(/ 20(\d\d)$/, " '$1"),
      coldCalls: m.counts.cold_calls,
      meetings: m.counts.meetings_booked,
      ...m.rates,
    };
  });

  const followUpsDue = await tx
    .select()
    .from(prospects)
    .where(
      and(
        isNull(prospects.archivedAt),
        lte(prospects.nextFollowUpOn, ws.today),
        notInArray(prospects.status, ["won", "lost", "disqualified"]),
        ...(track ? [eq(prospects.trackId, track.id)] : []),
      ),
    )
    .orderBy(asc(prospects.nextFollowUpOn))
    .limit(20);
  const openDeals = await listDeals(tx, { trackId: track?.id, open: true });
  const recent = await listActivities(tx, { trackId: track?.id, limit: 10 });
  const openPipeline: Record<string, number> = {};
  for (const { deal } of openDeals) if (deal.amount) openPipeline[deal.currency] = (openPipeline[deal.currency] ?? 0) + deal.amount;

  return {
    today: ws.today,
    period: query.period,
    range,
    label: periodLabel(query.period, range),
    previousAnchor: ranges[TREND_PERIODS - 2].start,
    nextAnchor: shiftPeriod(query.period, range, 1, ws.weekStartsOn).start,
    isCurrent: ws.today >= range.start && ws.today <= range.end,
    tracks,
    track: track ?? null,
    counts: current.counts,
    rates: current.rates,
    previousRates: previous.rates,
    metrics,
    trend,
    openDeals,
    openPipeline,
    followUpsDue,
    recent,
  };
}
export type SalesDashboard = Awaited<ReturnType<typeof getDashboard>>;

// ---------------------------------------------------------------------------
// Journal
// ---------------------------------------------------------------------------

export async function listJournal(tx: Tx, filter: { kind?: string; q?: string; tag?: string } = {}) {
  const where: SQL[] = [];
  if (filter.kind) where.push(eq(salesJournalEntries.kind, filter.kind as JournalCreateInput["kind"]));
  if (filter.tag) where.push(sql`${filter.tag} = any(${salesJournalEntries.tags})`);
  if (filter.q) {
    const q = `%${filter.q}%`;
    where.push(or(ilike(salesJournalEntries.title, q), ilike(salesJournalEntries.situation, q), ilike(salesJournalEntries.response, q), ilike(salesJournalEntries.lesson, q))!);
  }
  return tx
    .select()
    .from(salesJournalEntries)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(salesJournalEntries.occurredOn), desc(salesJournalEntries.createdAt))
    .limit(200);
}

export async function createJournalEntry(tx: Tx, input: JournalCreateInput) {
  const ws = await requireWorkspace(tx);
  if (input.prospectId) await findProspect(tx, input.prospectId);
  if (input.trackId) await resolveTrack(tx, input.trackId);
  const [row] = await tx.insert(salesJournalEntries).values({ ...input, occurredOn: input.occurredOn ?? ws.today }).returning();
  return row;
}

export async function updateJournalEntry(tx: Tx, id: string, patch: Partial<JournalCreateInput>) {
  const { occurredOn, ...rest } = patch;
  const [row] = await tx
    .update(salesJournalEntries)
    .set({ ...rest, ...(occurredOn ? { occurredOn } : {}) })
    .where(eq(salesJournalEntries.id, id))
    .returning();
  if (!row) throw notFound("Journal entry");
  return row;
}

export async function deleteJournalEntry(tx: Tx, id: string) {
  const rows = await tx.delete(salesJournalEntries).where(eq(salesJournalEntries.id, id)).returning({ id: salesJournalEntries.id });
  if (rows.length === 0) throw notFound("Journal entry");
}
