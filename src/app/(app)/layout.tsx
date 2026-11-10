import { Settings, Target } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { MainNav, NavBar } from "@/components/main-nav";
import { MobileNav, MobileTabs } from "@/components/mobile-nav";
import { OfflineBanner } from "@/components/pwa";
import { SignOutForm } from "@/components/sign-out";
import { BellLink, InboxBell } from "@/features/notifications/components/inbox-bell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only z-50 rounded-md bg-background px-3 py-2 focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:ring-2 focus:ring-ring">
        Skip to content
      </a>
      <OfflineBanner />
      <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4 sm:gap-4">
          <Link href="/today" className="flex shrink-0 items-center gap-2 font-semibold" aria-label="FiveYearOS home">
            <Target className="size-5" aria-hidden /> <span>FiveYearOS</span>
          </Link>
          <div className="hidden min-w-0 sm:block">
            <Suspense fallback={<NavBar active={null} />}>
              <MainNav />
            </Suspense>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <Suspense fallback={<BellLink count={null} />}>
              <InboxBell />
            </Suspense>
            <Link href="/settings" className="hidden size-10 place-items-center rounded-md hover:bg-accent sm:grid" aria-label="Settings">
              <Settings className="size-5" aria-hidden />
            </Link>
            <SignOutForm />
          </div>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-6 outline-none sm:pb-6">
        {children}
      </main>
      <Suspense fallback={<MobileTabs pathname={null} />}>
        <MobileNav />
      </Suspense>
    </div>
  );
}
