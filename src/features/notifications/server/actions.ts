"use server";

import { redirect } from "next/navigation";
import { NOTIFICATION_KINDS } from "@/lib/domain/notifications";
import { formCheckbox, formNullable, formText, runAction, runSimpleAction, type ActionState } from "@/lib/server-action";
import { preferencesSchema } from "../schemas";
import { webPushSender } from "./push";
import * as service from "./service";

/** Builds the preference object from the form: `<kind>.enabled`, `<kind>.time`, `weekly_review.weekday`. */
function preferencesFrom(fd: FormData) {
  const kinds = Object.fromEntries(
    NOTIFICATION_KINDS.map((k) => [k, { enabled: formCheckbox(fd, `${k}.enabled`), ...(k === "milestones" ? {} : { time: formText(fd, `${k}.time`) }) }]),
  );
  return preferencesSchema.parse({
    ...kinds,
    weekly_review: { ...kinds.weekly_review, weekday: formText(fd, "weekly_review.weekday") },
    quietStart: formNullable(fd, "quietStart"),
    quietEnd: formNullable(fd, "quietEnd"),
    push: formCheckbox(fd, "push"),
  });
}

export async function savePreferencesAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction((tx) => service.savePreferences(tx, preferencesFrom(fd)), { success: "Notification settings saved." });
}

export async function markReadAction(id: string | "all"): Promise<void> {
  await runSimpleAction((tx) => service.markRead(tx, id));
}

/** Marks the item read and opens what it points to. */
export async function openNotificationAction(id: string, url: string): Promise<void> {
  await runSimpleAction((tx) => service.markRead(tx, id));
  redirect(url.startsWith("/") && !url.startsWith("//") ? url : "/notifications");
}

export async function checkNowAction(): Promise<ActionState> {
  let found = 0;
  const state = await runAction(async (tx) => {
    found = (await service.runForUser(tx, new Date(), webPushSender())).created;
  });
  if (!state?.ok) return state;
  return { ok: true, message: found ? `${found} new reminder${found === 1 ? "" : "s"}.` : "Nothing new is due right now." };
}

export async function sendTestAction(): Promise<ActionState> {
  let result = { delivered: 0, devices: 0 };
  const state = await runAction(async (tx) => {
    result = await service.sendTest(tx, webPushSender());
  });
  if (!state?.ok) return state;
  if (!result.devices) return { ok: true, message: "Test added to your inbox. No device is subscribed to push, so nothing was pushed." };
  return { ok: result.delivered > 0, message: `Test added to your inbox and pushed to ${result.delivered} of ${result.devices} device${result.devices === 1 ? "" : "s"}.` };
}

export async function removeDeviceAction(id: string): Promise<void> {
  await runSimpleAction((tx) => service.removeSubscription(tx, id));
}
