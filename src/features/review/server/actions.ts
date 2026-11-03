"use server";

import type { Tx } from "@/db/client";
import { weeklyGoalCreateSchema } from "@/features/weekly/schemas";
import { formNullable, formObject, formText, runAction, type ActionState } from "@/lib/server-action";
import { answersSchema } from "../schemas";
import * as service from "./service";

const run = (fn: (tx: Tx) => Promise<unknown>, success?: string) => runAction(fn, { success });

function answersFromForm(fd: FormData) {
  const raw = formObject(fd, "null");
  const missed = fd.getAll("missedGoal").map(String).flatMap((goalId) => {
    const reason = formText(fd, `reason_${goalId}`);
    return reason ? [{ goalId, reason, note: formNullable(fd, `note_${goalId}`) }] : [];
  });
  return answersSchema.parse({ ...raw, missed });
}

/** Save draft, or complete when the "Complete review" button was used. */
export async function saveReviewAction(weekStart: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const complete = fd.get("intent") === "complete";
  return run(async (tx) => {
    const answers = answersFromForm(fd);
    if (complete) await service.completeReview(tx, weekStart, answers);
    else await service.saveReview(tx, weekStart, answers);
  }, complete ? "Review completed." : "Draft saved.");
}

export async function approveSuggestionAction(weekStart: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run((tx) => service.approveSuggestion(tx, weekStart, weeklyGoalCreateSchema.parse({ ...formObject(fd), targetValue: Number(formText(fd, "targetValue")) })), "Added to next week.");
}

export async function setFocusAction(weekStart: string, focus: string): Promise<ActionState> {
  return run((tx) => service.setNextWeekFocus(tx, weekStart, focus), "Set as next week's focus.");
}
