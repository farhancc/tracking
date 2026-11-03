import "server-only";
import { withUser } from "@/db/client";
import { getWorkspace } from "@/features/goals/server/service";
import { requireUser } from "@/lib/auth/current-user";
import { vapidPublicKey, webPushSender } from "./push";
import { getPreferences, listInbox, listSubscriptions, unreadCount } from "./service";

export async function loadUnreadCount() {
  const { userId } = await requireUser();
  return withUser(userId, (tx) => unreadCount(tx));
}

export async function loadInbox() {
  const { userId } = await requireUser();
  return withUser(userId, async (tx) => ({
    timezone: (await getWorkspace(tx)).profile?.timezone ?? "UTC",
    inbox: await listInbox(tx, 100),
    unread: await unreadCount(tx),
  }));
}

export async function loadNotificationSettings() {
  const { userId } = await requireUser();
  return withUser(userId, async (tx) => {
    const ws = await getWorkspace(tx);
    return {
      timezone: ws.profile?.timezone ?? "UTC",
      prefs: await getPreferences(tx),
      subscriptions: await listSubscriptions(tx),
      vapidPublicKey: vapidPublicKey(),
      pushConfigured: webPushSender() !== null,
    };
  });
}
