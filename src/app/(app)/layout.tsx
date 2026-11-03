import Link from "next/link";
import { Target } from "lucide-react";
import { SubmitButton } from "@/components/submit-button";

const NAV = [
  { href: "/goals", label: "Goals" },
  { href: "/goals/vision", label: "Vision" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
          <Link href="/goals" className="flex items-center gap-2 font-semibold">
            <Target className="size-5" aria-hidden /> FiveYearOS
          </Link>
          <nav aria-label="Main" className="flex items-center gap-1 text-sm">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className="rounded-md px-3 py-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">
                {item.label}
              </Link>
            ))}
          </nav>
          <form action="/api/auth/logout" method="post" className="ml-auto">
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
