"use server";

import type { Tx } from "@/db/client";
import type { CallOutcome, DealStage, SalesMetric, SalesPeriod } from "@/lib/domain/sales";
import { formCheckbox, formNullable, formNullableNumber, formText, runAction, runSimpleAction, type ActionState } from "@/lib/server-action";
import { activityCreateSchema, dealCreateSchema, journalCreateSchema, prospectCreateSchema, trackCreateSchema } from "../schemas";
import * as service from "./service";

const run = (fn: (tx: Tx) => Promise<unknown>, success?: string) => runAction(fn, { success });
const simple = (fn: (tx: Tx) => Promise<unknown>) => runSimpleAction(fn);

/** One tap: log a cold call with its outcome. */
export async function logCallAction(trackId: string | null, outcome: CallOutcome): Promise<void> {
  await simple((tx) => service.logActivity(tx, activityCreateSchema.parse({ kind: "cold_call", outcome, trackId })));
}

/** One tap: prospecting attempt (email/LinkedIn) or follow-up, with or without a response. */
export async function logQuickActivityAction(trackId: string | null, kind: "prospecting" | "follow_up", responded: boolean): Promise<void> {
  await simple((tx) =>
    service.logActivity(tx, activityCreateSchema.parse({ kind, connected: responded, trackId, channel: kind === "prospecting" ? "email" : "other" })),
  );
}

export async function logActivityAction(trackId: string | null, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async (tx) => {
    const kind = formText(fd, "kind");
    await service.logActivity(
      tx,
      activityCreateSchema.parse({
        trackId,
        kind,
        outcome: kind === "cold_call" ? formNullable(fd, "outcome") : null,
        connected: formCheckbox(fd, "connected"),
        reachedDecisionMaker: formCheckbox(fd, "reachedDecisionMaker"),
        qualified: formCheckbox(fd, "qualified"),
        meetingBooked: formCheckbox(fd, "meetingBooked"),
        amount: kind === "quotation" ? formNullableNumber(fd, "amount") : null,
        prospectId: formNullable(fd, "prospectId"),
        dealId: formNullable(fd, "dealId"),
        channel: formNullable(fd, "channel"),
        occurredOn: formNullable(fd, "occurredOn"),
        notes: formNullable(fd, "notes"),
      }),
    );
  }, "Logged.");
}

export async function deleteActivityAction(id: string): Promise<void> {
  await simple((tx) => service.deleteActivity(tx, id));
}

export async function createProspectAction(trackId: string | null, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async (tx) => {
    await service.createProspect(
      tx,
      prospectCreateSchema.parse({
        trackId,
        name: formText(fd, "name"),
        company: formNullable(fd, "company"),
        role: formNullable(fd, "role"),
        source: formNullable(fd, "source"),
        nextFollowUpOn: formNullable(fd, "nextFollowUpOn"),
      }),
    );
  }, "Prospect added.");
}

export async function setFollowUpAction(prospectId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async (tx) => {
    await service.updateProspect(tx, prospectId, { nextFollowUpOn: formNullable(fd, "nextFollowUpOn") });
  });
}

export async function createDealAction(trackId: string | null, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async (tx) => {
    await service.createDeal(
      tx,
      dealCreateSchema.parse({
        trackId,
        title: formText(fd, "title"),
        prospectId: formNullable(fd, "prospectId"),
        amount: formNullableNumber(fd, "amount"),
        stage: formText(fd, "stage") ?? "qualified",
        expectedCloseOn: formNullable(fd, "expectedCloseOn"),
      }),
    );
  }, "Deal added.");
}

export async function moveDealAction(dealId: string, stage: DealStage): Promise<void> {
  await simple((tx) => service.updateDeal(tx, dealId, { stage }));
}

export async function closeDealAction(dealId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async (tx) => {
    const outcome = formText(fd, "outcome") === "lost" ? "lost" : "won";
    await service.updateDeal(tx, dealId, {
      stage: outcome,
      amount: formNullableNumber(fd, "amount") ?? undefined,
      closedOn: formNullable(fd, "closedOn"),
      lostReason: outcome === "lost" ? formNullable(fd, "lostReason") : null,
    });
  }, "Deal closed.");
}

export async function setTargetAction(trackId: string, period: SalesPeriod, metric: SalesMetric, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async (tx) => {
    await service.setTarget(tx, { trackId, period, metric, targetValue: formNullableNumber(fd, "target"), effectiveFrom: null });
  });
}

export async function createTrackAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async (tx) => {
    await service.createTrack(
      tx,
      trackCreateSchema.parse({ name: formText(fd, "name"), currency: formText(fd, "currency"), description: formNullable(fd, "description"), isDefault: formCheckbox(fd, "isDefault") }),
    );
  }, "Track added.");
}

export async function createJournalAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async (tx) => {
    const worked = formText(fd, "worked");
    await service.createJournalEntry(
      tx,
      journalCreateSchema.parse({
        kind: formText(fd, "kind"),
        title: formText(fd, "title"),
        occurredOn: formNullable(fd, "occurredOn"),
        situation: formNullable(fd, "situation"),
        response: formNullable(fd, "response"),
        worked: worked === "yes" ? true : worked === "no" ? false : null,
        lesson: formNullable(fd, "lesson"),
        tags: (formText(fd, "tags") ?? "")
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      }),
    );
  }, "Journal entry saved.");
}

export async function deleteJournalAction(id: string): Promise<void> {
  await simple((tx) => service.deleteJournalEntry(tx, id));
}

