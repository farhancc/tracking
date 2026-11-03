import "server-only";
import { withUser } from "@/db/client";
import { listUserIds } from "@/lib/auth/sessions";
import { webPushSender } from "./push";
import { runForUser } from "./service";

/** Runs the reminder check for every user, each in their own RLS transaction. One user's failure doesn't stop the rest. */
export async function runAllUsers(at = new Date()) {
  const sender = webPushSender();
  const results = { users: 0, created: 0, pushed: 0, failed: 0, push: sender !== null };
  for (const userId of await listUserIds()) {
    results.users += 1;
    try {
      const r = await withUser(userId, (tx) => runForUser(tx, at, sender));
      results.created += r.created;
      results.pushed += r.pushed;
    } catch (e) {
      results.failed += 1;
      console.error(`notification run failed for ${userId}`, e);
    }
  }
  return results;
}
