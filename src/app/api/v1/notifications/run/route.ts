import { webPushSender } from "@/features/notifications/server/push";
import { runForUser } from "@/features/notifications/server/service";
import { apiRoute } from "@/lib/api/route";

/** POST /api/v1/notifications/run: check the signed-in user's reminders now (same as the cron job, for one user). */
export const POST = apiRoute(({ tx }) => runForUser(tx, new Date(), webPushSender()));
