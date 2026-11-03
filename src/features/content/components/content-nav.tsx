import Link from "next/link";
import { cn } from "@/lib/utils";

const LINKS = [
  ["/content", "Pipeline"],
  ["/content/ideas", "Idea library"],
  ["/content/calendar", "Calendar"],
] as const;

export function ContentNav({ current }: { current: (typeof LINKS)[number][0] }) {
  return (
    <nav aria-label="Content sections" className="-mx-4 flex gap-1 overflow-x-auto border-b px-4">
      {LINKS.map(([href, label]) => (
        <Link
          key={href}
          href={href}
          aria-current={current === href ? "page" : undefined}
          className={cn("shrink-0 border-b-2 px-3 py-2 text-sm", current === href ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground")}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
