import { z } from "zod";
import { subscriptionSchema } from "@/features/notifications/schemas";
import { listSubscriptions, subscribe, unsubscribe } from "@/features/notifications/server/service";
import { apiRoute } from "@/lib/api/route";

/** GET /api/v1/notifications/subscriptions: devices receiving push. */
export const GET = apiRoute(({ tx }) => listSubscriptions(tx));

/** POST /api/v1/notifications/subscriptions: a PushSubscription.toJSON() from the browser. */
export const POST = apiRoute(
  async ({ tx, body, request }) => subscribe(tx, await body(subscriptionSchema), request.headers.get("user-agent")?.slice(0, 300) ?? null),
  { status: 201 },
);

/** DELETE /api/v1/notifications/subscriptions { endpoint } */
export const DELETE = apiRoute(async ({ tx, body }) => unsubscribe(tx, (await body(z.object({ endpoint: z.string().url() }))).endpoint));
