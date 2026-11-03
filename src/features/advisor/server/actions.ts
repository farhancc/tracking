"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/current-user";
import { formText, runAction, type ActionState } from "@/lib/server-action";
import { advisorConfigured, askAdvisor } from "./advisor";
import { confirmProposal, rejectProposal } from "./proposals";

/** Asks the advisor. Not wrapped in one transaction: the model call can take a while. */
export async function askAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  if (!advisorConfigured()) return { ok: false, message: "The AI advisor needs Anthropic API credentials on the server (ANTHROPIC_API_KEY)." };
  const question = formText(fd, "question");
  if (!question) return { ok: false, message: "Ask a question." };
  const { userId } = await requireUser();
  const r = await askAdvisor({ userId, question });
  revalidatePath("/advisor");
  return r.error ? { ok: false, message: r.error } : { ok: true, message: "Answered below." };
}

export async function confirmProposalAction(id: string): Promise<ActionState> {
  return runAction((tx) => confirmProposal(tx, id), { success: "Applied." });
}

export async function rejectProposalAction(id: string): Promise<ActionState> {
  return runAction((tx) => rejectProposal(tx, id), { success: "Rejected." });
}
