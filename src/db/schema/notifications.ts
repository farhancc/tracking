/**
 * Notifications: preferences, browser push subscriptions, and the in-app
 * inbox (every reminder lands here, pushed or not).
 */
import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { NOTIFICATION_KINDS, type Preferences } from "../../lib/domain/notifications";
import { inList, ownerColumn, pk } from "./_columns";
import { users } from "./auth";

export const notificationPreferences = pgTable("notification_preferences", {
  userId: uuid("user_id")
    .primaryKey()
    .default(sql`app.current_user_id()`)
    .references(() => users.id, { onDelete: "cascade" }),
  prefs: jsonb("prefs").$type<Preferences>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: pk(),
    userId: ownerColumn().references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    failures: integer("failures").notNull().default(0),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("push_subscriptions_endpoint_key").on(t.endpoint),
    check("push_subscriptions_endpoint_check", sql`${t.endpoint} ~ '^https://'`),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    id: pk(),
    userId: ownerColumn().references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: NOTIFICATION_KINDS }).notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    url: text("url").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp("read_at", { withTimezone: true }),
    pushedAt: timestamp("pushed_at", { withTimezone: true }),
    pushNote: text("push_note"),
  },
  (t) => [
    unique("notifications_user_dedupe_key").on(t.userId, t.dedupeKey),
    check("notifications_kind_check", sql`${t.kind} in (${inList(NOTIFICATION_KINDS)})`),
    check("notifications_url_check", sql`${t.url} ~ '^/'`),
    index("notifications_user_unread_idx").on(t.userId, t.createdAt).where(sql`${t.readAt} is null`),
  ],
);
