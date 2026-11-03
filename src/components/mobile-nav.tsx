"use client";

import { CalendarCheck, CalendarDays, Flame, LayoutGrid, Sun, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { activeHref, GROUPS } from "./main-nav";

const TABS = [
  { href: "/today", label: "Today", icon: Sun },
  { href: "/checkin", label: "Check-in", icon: CalendarCheck },
  { href: "/week", label: "Week", icon: CalendarDays },
  { href: "/habits", label: "Habits", icon: Flame },
] as const;

/** Bottom tab bar for phones: the daily screens within thumb reach, everything else under More. */
export function MobileNav() {
  return <MobileTabs pathname={usePathname()} />;
}

export function MobileTabs({ pathname }: { pathname: string | null }) {
  const [open, setOpen] = useState(false);
  const active = pathname ? (pathname.startsWith("/checkin") ? "/checkin" : activeHref(pathname)) : null;
  const inMore = active != null && !TABS.some((t) => t.href === active);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  const tab = (isActive: boolean) => cn("flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px]", isActive ? "font-medium text-foreground" : "text-muted-foreground");
  return (
    <>
      {open ? (
        <div className="fixed inset-0 z-40 sm:hidden" role="dialog" aria-modal="true" aria-label="All sections">
          <button type="button" className="absolute inset-0 bg-black/30" aria-label="Close menu" onClick={() => setOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[75dvh] overflow-y-auto rounded-t-2xl border-t bg-background p-4 pb-[calc(env(safe-area-inset-bottom)+5rem)]">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-semibold">All sections</span>
              <button type="button" onClick={() => setOpen(false)} className="grid size-10 place-items-center rounded-md hover:bg-accent" aria-label="Close">
                <X className="size-5" aria-hidden />
              </button>
            </div>
            {GROUPS.map((g) => (
              <section key={g.label} className="mb-3">
                <h2 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{g.label}</h2>
                <ul className="grid grid-cols-2 gap-2">
                  {g.items.map((i) => (
                    <li key={i.href}>
                      <Link href={i.href} onClick={() => setOpen(false)} aria-current={active === i.href ? "page" : undefined} className={cn("flex min-h-11 items-center rounded-lg border px-3", active === i.href ? "border-primary bg-accent font-medium" : "hover:bg-accent")}>
                        {i.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            <Link href="/settings/notifications" onClick={() => setOpen(false)} className="flex min-h-11 items-center rounded-lg border px-3 hover:bg-accent">
              Notification settings
            </Link>
          </div>
        </div>
      ) : null}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 flex border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden">
        {TABS.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} onClick={() => setOpen(false)} aria-current={active === href ? "page" : undefined} className={tab(active === href)}>
            <Icon className="size-5" aria-hidden />
            {label}
          </Link>
        ))}
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className={tab(inMore || open)}>
          <LayoutGrid className="size-5" aria-hidden />
          More
        </button>
      </nav>
    </>
  );
}
