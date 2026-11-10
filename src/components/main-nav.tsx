"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string };

/** Daily-use screens stay one tap away; the rest sit in three small menus. */
export const PRIMARY: Item[] = [
  { href: "/today", label: "Today" },
  { href: "/week", label: "Week" },
  { href: "/habits", label: "Habits" },
];
export const GROUPS: { label: string; items: Item[] }[] = [
  {
    label: "Grow",
    items: [
      { href: "/sales", label: "Sales" },
      { href: "/communication", label: "Speak" },
      { href: "/psychology", label: "Psychology" },
      { href: "/knowledge", label: "Knowledge" },
    ],
  },
  {
    label: "Build",
    items: [
      { href: "/products", label: "Products" },
      { href: "/content", label: "Content" },
      { href: "/finance", label: "Finance" },
    ],
  },
  {
    label: "Plan",
    items: [
      { href: "/review", label: "Weekly review" },
      { href: "/analytics", label: "Analytics" },
      { href: "/advisor", label: "Advisor" },
      { href: "/goals", label: "Goals" },
      { href: "/roadmap", label: "Roadmap" },
      { href: "/goals/vision", label: "Vision" },
    ],
  },
];

const ALL = [...PRIMARY, ...GROUPS.flatMap((g) => g.items)];

/** The most specific nav entry for a path (so /goals/vision isn't also "Goals"). */
export function activeHref(pathname: string): string | null {
  const matches = ALL.filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`));
  return matches.sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null;
}

/** Reads the URL, so it sits inside <Suspense> in the layout (see NavBar for the fallback). */
export function MainNav() {
  return <NavBar active={activeHref(usePathname())} />;
}

/** The nav itself. Rendered with `active={null}` as the Suspense fallback while prerendering. */
export function NavBar({ active }: { active: string | null }) {
  const [open, setOpen] = useState<string | null>(null);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const linkClass = (href: string) =>
    cn("shrink-0 rounded-md px-2 py-1.5 sm:px-3", active === href ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground");

  return (
    <nav ref={ref} aria-label="Main" className="flex min-w-0 items-center gap-1 text-sm">
      {PRIMARY.map((i) => (
        <Link key={i.href} href={i.href} aria-current={active === i.href ? "page" : undefined} className={linkClass(i.href)}>
          {i.label}
        </Link>
      ))}
      {GROUPS.map((g) => {
        const current = g.items.find((i) => i.href === active);
        const id = `nav-${g.label.toLowerCase()}`;
        return (
          <div key={g.label} className="relative">
            <button
              type="button"
              aria-label={current ? `${g.label}: ${current.label}` : g.label}
              aria-expanded={open === g.label}
              aria-controls={id}
              onClick={() => setOpen(open === g.label ? null : g.label)}
              className={cn(
                "flex shrink-0 items-center gap-1 rounded-md px-2 py-1.5 sm:px-3",
                current ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <span className="hidden sm:inline">{current ? `${g.label} · ${current.label}` : g.label}</span>
              <span className="sm:hidden">{g.label}</span>
              <ChevronDown className="hidden size-3.5 sm:block" aria-hidden />
            </button>
            {open === g.label ? (
              <ul id={id} className="absolute right-0 top-full z-20 mt-1 min-w-40 rounded-lg border bg-card p-1 shadow-md sm:left-0 sm:right-auto">
                {g.items.map((i) => (
                  <li key={i.href}>
                    <Link
                      href={i.href}
                      onClick={() => setOpen(null)}
                      aria-current={active === i.href ? "page" : undefined}
                      className={cn("block rounded-md px-3 py-2", active === i.href ? "bg-accent font-medium" : "hover:bg-accent")}
                    >
                      {i.label}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}
