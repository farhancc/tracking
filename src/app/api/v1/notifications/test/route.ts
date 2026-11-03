import { webPushSender } from "@/features/notifications/server/push";
import { sendTest } from "@/features/notifications/server/service";
import { apiRoute } from "@/lib/api/route";

/** POST /api/v1/notifications/test: adds a test item to the inbox and pushes it to every subscribed device. */
export const POST = apiRoute(({ tx }) => sendTest(tx, webPushSender()));
