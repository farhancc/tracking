import { listInbox, unreadCount } from "@/features/notifications/server/service";
import { apiRoute } from "@/lib/api/route";

/** GET /api/v1/notifications: the inbox, newest first, with the unread count. */
export const GET = apiRoute(async ({ tx }) => ({ items: await listInbox(tx, 100), unread: await unreadCount(tx) }));
