import Link from "next/link";
import { Suspense } from "react";
import { Target } from "lucide-react";
import { MainNav, NavBar } from "@/components/main-nav";
import { SubmitButton } from "@/components/submit-button";


export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2 sm:h-14 sm:flex-nowrap sm:gap-4 sm:py-0">
          <Link href="/today" className="flex shrink-0 items-center gap-2 font-semibold" aria-label="FiveYearOS home">
            <Target className="size-5" aria-hidden /> <span>FiveYearOS</span>
          </Link>
          <Suspense fallback={<NavBar active={null} />}>
            <MainNav />
          </Suspense>
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
