import { afterAll, describe, expect, it } from "vitest";
import { activityCreateSchema, dealCreateSchema, journalCreateSchema, prospectCreateSchema } from "../../src/features/sales/schemas";
import {
  createDeal,
  createJournalEntry,
  createProspect,
  createTrack,
  ensureDefaultTrack,
  getDashboard,
  listJournal,
  logActivity,
  setTarget,
  updateDeal,
} from "../../src/features/sales/server/service";
import { connect, rejectsWith } from "./helpers";

const h = connect();
afterAll(() => h.close());

const act = (o: Record<string, unknown>) => activityCreateSchema.parse({ occurredOn: "2026-10-14", ...o });
const WEEK = "2026-10-12"; // Monday

describe("activity log and funnel", () => {
  it("logs calls on an outcome ladder and computes weekly rates", async () => {
    const o = await h.newOwner();
    const track = await h.as(o.userId, (tx) => ensureDefaultTrack(tx));
    expect(track).toMatchObject({ name: "My sales", currency: "USD", isDefault: true });

    const outcomes = ["no_answer", "no_answer", "no_answer", "no_answer", "connected", "connected", "decision_maker", "decision_maker", "qualified", "meeting_booked"];
    for (const outcome of outcomes) await h.as(o.userId, (tx) => logActivity(tx, act({ kind: "cold_call", outcome })));
    await h.as(o.userId, (tx) => logActivity(tx, act({ kind: "follow_up", connected: true })));
    await h.as(o.userId, (tx) => logActivity(tx, act({ kind: "follow_up" })));

    const d = await h.as(o.userId, (tx) => getDashboard(tx, { period: "week", anchor: WEEK }));
    expect(d.counts).toMatchObject({ cold_calls: 10, calls_connected: 6, decision_makers_reached: 4, qualified_leads: 2, meetings_booked: 1, follow_ups: 2 });
    expect(d.rates).toMatchObject({ connectionRate: 60, qualificationRate: 50, meetingConversionRate: 50, followUpEffectiveness: 50 });
    expect(d.trend).toHaveLength(8);
    expect(d.trend[7]).toMatchObject({ start: WEEK, coldCalls: 10, connectionRate: 60 });

    // The ladder is enforced in the database too.
    await rejectsWith(
      h.as(o.userId, (tx) =>
        tx.execute(`insert into sales_activities (track_id, kind, occurred_on, meeting_booked) values ('${track.id}', 'cold_call', '2026-10-14', true)`),
      ),
      { code: "23514" },
    );
    await expect(h.as(o.userId, (tx) => logActivity(tx, act({ kind: "cold_call", occurredOn: "2999-01-01" })))).rejects.toMatchObject({
      cause: expect.objectContaining({ detail: "occurred_in_future" }),
    });
  });

  it("opens a deal for a quotation, advances the prospect and measures closing", async () => {
    const o = await h.newOwner();
    const p = await h.as(o.userId, (tx) => createProspect(tx, prospectCreateSchema.parse({ name: "Priya Shah", company: "Acme" })));
    await h.as(o.userId, (tx) => logActivity(tx, act({ kind: "cold_call", outcome: "meeting_booked", prospectId: p.id })));
    const quote = await h.as(o.userId, (tx) => logActivity(tx, act({ kind: "quotation", prospectId: p.id, amount: 4800 })));
    expect(quote.dealId).not.toBeNull();
    expect(quote.currency).toBe("USD");

    const deal = await h.as(o.userId, (tx) => updateDeal(tx, quote.dealId!, { stage: "won", closedOn: "2026-10-16" }));
    expect(deal).toMatchObject({ stage: "won", amount: 4800, closedOn: "2026-10-16" });
    const lost = await h.as(o.userId, (tx) => createDeal(tx, dealCreateSchema.parse({ title: "Beta Corp", amount: 2000, stage: "proposal" })));
    await h.as(o.userId, (tx) => updateDeal(tx, lost.id, { stage: "lost", lostReason: "Budget frozen", closedOn: "2026-10-15" }));

    const d = await h.as(o.userId, (tx) => getDashboard(tx, { period: "week", anchor: WEEK }));
    expect(d.counts).toMatchObject({ quotations_sent: 1, deals_closed: 1, lost_deals: 1, revenue: { USD: 4800 } });
    expect(d.rates).toMatchObject({ closingRate: 50, proposalConversionRate: 100, averageDealValue: { USD: 4800 }, revenuePerProspect: { USD: 4800 } });
    const prospect = await h.as(o.userId, (tx) => tx.execute(`select status from prospects where id = '${p.id}'`));
    expect(prospect.rows[0]).toEqual({ status: "won" });

    // A quotation for a prospect with one open deal moves that deal to "proposal" instead of opening another.
    const p2 = await h.as(o.userId, (tx) => createProspect(tx, prospectCreateSchema.parse({ name: "Daniel Kim", company: "Northwind" })));
    const open = await h.as(o.userId, (tx) => createDeal(tx, dealCreateSchema.parse({ title: "Northwind – 50 seats", prospectId: p2.id, stage: "meeting" })));
    const q2 = await h.as(o.userId, (tx) => logActivity(tx, act({ kind: "quotation", prospectId: p2.id, amount: 8500 })));
    expect(q2.dealId).toBe(open.id);
    const advanced = await h.as(o.userId, (tx) => tx.execute(`select stage, amount from deals where id = '${open.id}'`));
    expect(advanced.rows[0]).toEqual({ stage: "proposal", amount: "8500.00" });

    // Won needs an amount; closing in the future is rejected.
    const noAmount = await h.as(o.userId, (tx) => createDeal(tx, dealCreateSchema.parse({ title: "No amount" })));
    await expect(h.as(o.userId, (tx) => updateDeal(tx, noAmount.id, { stage: "won" }))).rejects.toMatchObject({ code: "won_without_amount" });
    await rejectsWith(h.as(o.userId, (tx) => updateDeal(tx, lost.id, { stage: "lost", closedOn: "2999-01-01" })), { detail: "closed_in_future" });
  });
});

describe("targets and tracks", () => {
  it("applies effective-dated targets per track and keeps currencies apart", async () => {
    const o = await h.newOwner();
    const usd = await h.as(o.userId, (tx) => ensureDefaultTrack(tx));
    const inr = await h.as(o.userId, (tx) => createTrack(tx, { name: "Employer – India", currency: "INR", description: null, isDefault: false }));

    await h.as(o.userId, (tx) => setTarget(tx, { trackId: inr.id, metric: "cold_calls", period: "week", targetValue: 50, effectiveFrom: "2026-10-05" }));
    await h.as(o.userId, (tx) => setTarget(tx, { trackId: inr.id, metric: "cold_calls", period: "week", targetValue: 80, effectiveFrom: "2026-10-19" }));
    for (let i = 0; i < 20; i++) await h.as(o.userId, (tx) => logActivity(tx, act({ kind: "cold_call", outcome: "no_answer", trackId: inr.id })));
    const won = await h.as(o.userId, (tx) => createDeal(tx, dealCreateSchema.parse({ title: "Enterprise plan", trackId: inr.id, amount: 250000, stage: "won", closedOn: "2026-10-13" })));
    expect(won.currency).toBe("INR");
    await h.as(o.userId, (tx) => createDeal(tx, dealCreateSchema.parse({ title: "Starter", trackId: usd.id, amount: 99, stage: "won", closedOn: "2026-10-13" })));

    const inrWeek = await h.as(o.userId, (tx) => getDashboard(tx, { period: "week", anchor: WEEK, trackId: inr.id }));
    const calls = inrWeek.metrics.find((m) => m.metric === "cold_calls")!;
    expect(calls).toMatchObject({ actual: 20, target: 50, attainment: 40 }); // the later 80 target doesn't apply yet
    expect(inrWeek.metrics.find((m) => m.metric === "revenue")).toMatchObject({ actual: 250000 });

    const later = await h.as(o.userId, (tx) => getDashboard(tx, { period: "week", anchor: "2026-10-19", trackId: inr.id }));
    expect(later.metrics.find((m) => m.metric === "cold_calls")!.target).toBe(80);

    const all = await h.as(o.userId, (tx) => getDashboard(tx, { period: "month", anchor: "2026-10-01" }));
    expect(all.counts.revenue).toEqual({ INR: 250000, USD: 99 });
    expect(all.tracks.map((t) => t.name)).toEqual(["My sales", "Employer – India"]);
  });
});

describe("sales learning journal", () => {
  it("records objections, responses and lessons, searchable by text and tag", async () => {
    const o = await h.newOwner();
    await h.as(o.userId, (tx) =>
      createJournalEntry(
        tx,
        journalCreateSchema.parse({
          kind: "objection",
          title: "“We already have a vendor”",
          situation: "Ops manager, mid-size logistics firm",
          response: "Asked what they'd change about the current vendor",
          worked: true,
          tags: ["Incumbent", "status-quo"],
        }),
      ),
    );
    await h.as(o.userId, (tx) => createJournalEntry(tx, journalCreateSchema.parse({ kind: "mistake", title: "Pitched before discovery", lesson: "Ask three questions first" })));
    expect((await h.as(o.userId, (tx) => listJournal(tx, { q: "vendor" }))).map((e) => e.kind)).toEqual(["objection"]);
    expect((await h.as(o.userId, (tx) => listJournal(tx, { tag: "incumbent" }))).length).toBe(1);
    expect((await h.as(o.userId, (tx) => listJournal(tx, { kind: "mistake" })))[0].lesson).toBe("Ask three questions first");
  });
});
