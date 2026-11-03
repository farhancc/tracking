import Link from "next/link";
import { Target } from "lucide-react";
import { SubmitButton } from "@/components/submit-button";

const NAV = [
  { href: "/today", label: "Today" },
  { href: "/goals", label: "Goals" },
  { href: "/week", label: "Week" },
  { href: "/sales", label: "Sales" },
  { href: "/communication", label: "Speak" },
  { href: "/roadmap", label: "Roadmap" },
  { href: "/goals/vision", label: "Vision" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4 sm:gap-4">
          <Link href="/today" className="flex shrink-0 items-center gap-2 font-semibold" aria-label="FiveYearOS home">
            <Target className="size-5" aria-hidden /> <span className="hidden sm:inline">FiveYearOS</span>
          </Link>
          <nav aria-label="Main" className="flex min-w-0 items-center gap-0.5 overflow-x-auto text-sm sm:gap-1">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="shrink-0 rounded-md px-2.5 py-1.5 text-muted-foreground hover:bg-accent hover:text-foreground sm:px-3"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <form action="/api/auth/logout" method="post" className="ml-auto shrink-0">
            <SubmitButton variant="ghost" size="sm">
              Sign out
            </SubmitButton>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
