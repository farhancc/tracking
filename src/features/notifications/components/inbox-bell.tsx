import { Bell } from "lucide-react";
import Link from "next/link";
import { loadUnreadCount } from "../server/queries";

export function BellLink({ count }: { count: number | null }) {
  return (
    <Link href="/notifications" className="relative grid size-10 place-items-center rounded-md hover:bg-accent" aria-label={count ? `Notifications, ${count} unread` : "Notifications"}>
      <Bell className="size-5" aria-hidden />
      {count ? <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-medium leading-4 text-white">{count > 9 ? "9+" : count}</span> : null}
    </Link>
  );
}

export async function InboxBell() {
  return <BellLink count={await loadUnreadCount()} />;
}
