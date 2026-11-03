import { BellOff } from "lucide-react";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent } from "@/components/ui/card";
import { NOTIFICATION_LABELS, type NotificationKind } from "@/lib/domain/notifications";
import { cn } from "@/lib/utils";
import { checkNowAction, markReadAction, openNotificationAction } from "../server/actions";
import { loadInbox } from "../server/queries";

function when(d: Date, tz: string) {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: tz }).format(d);
}

export async function InboxView() {
  const { inbox, unread, timezone } = await loadInbox();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
          <p className="text-sm text-muted-foreground">{unread ? `${unread} unread` : "All caught up."} Reminders land here whether or not push is on.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {unread ? (
            <form action={markReadAction.bind(null, "all")}>
              <SubmitButton variant="outline">Mark all read</SubmitButton>
            </form>
          ) : null}
          <Link href="/settings/notifications" className="inline-flex h-10 items-center rounded-md border px-4 text-sm font-medium hover:bg-accent">
            Settings
          </Link>
        </div>
      </div>

      <ActionForm action={checkNowAction} submitLabel="Check for reminders now" pendingLabel="Checking…" submitVariant="outline" resetOnSuccess={false}>
        <p className="text-sm text-muted-foreground">Reminders are checked every 15 minutes when the scheduler is set up. You can also check now.</p>
      </ActionForm>

      {inbox.length === 0 ? (
        <Card>
          <CardContent className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
            <BellOff className="size-5 shrink-0" aria-hidden /> No notifications yet.
          </CardContent>
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {inbox.map((n) => (
            <li key={n.id} className="min-w-0">
              <Card className={cn(!n.readAt && "border-primary/40")}>
                <CardContent className="flex items-start gap-3 py-3">
                  <span className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-primary")} aria-hidden />
                  <form action={openNotificationAction.bind(null, n.id, n.url)} className="min-w-0 flex-1">
                    <button type="submit" className="w-full min-w-0 text-left">
                      <span className="sr-only">{n.readAt ? "" : "Unread: "}</span>
                      <span className={cn("block text-sm", !n.readAt && "font-medium")}>{n.title}</span>
                      <span className="mt-0.5 block text-sm text-muted-foreground">{n.body}</span>
                      <span className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                        <span>{NOTIFICATION_LABELS[n.kind as NotificationKind]?.label ?? n.kind}</span>
                        <span>{when(n.createdAt, timezone)}</span>
                        <span>{n.pushedAt ? "pushed" : n.pushNote ? `not pushed: ${n.pushNote}` : null}</span>
                      </span>
                    </button>
                  </form>
                  {!n.readAt ? (
                    <form action={markReadAction.bind(null, n.id)}>
                      <SubmitButton variant="ghost" className="h-10 px-2 text-xs" aria-label={`Mark "${n.title}" read`}>
                        Read
                      </SubmitButton>
                    </form>
                  ) : null}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
