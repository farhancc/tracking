"use client";

import { WifiOff } from "lucide-react";
import { useOffline } from "next/offline";
import { useEffect, useSyncExternalStore } from "react";

/** Pages kept ready for offline use; refreshed at most every few hours. */
const WARM_PATHS = ["/today", "/checkin", "/week", "/habits", "/notifications"];
const WARM_EVERY_MS = 3 * 60 * 60 * 1000;

function warm(reg: ServiceWorkerRegistration) {
  try {
    const last = Number(localStorage.getItem("fyos-warmed") ?? 0);
    if (Date.now() - last < WARM_EVERY_MS) return;
    localStorage.setItem("fyos-warmed", String(Date.now()));
  } catch {
    // storage blocked: warm anyway
  }
  reg.active?.postMessage({ type: "warm", paths: WARM_PATHS });
}

const subscribeOnline = (cb: () => void) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
};

/** Registers the service worker in production builds (dev keeps it off to avoid stale chunks). */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_SW_IN_DEV !== "1") return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then(() => navigator.serviceWorker.ready)
      .then(warm)
      .catch(() => {});
  }, []);
  return null;
}

/** Shown while the connection is down; actions wait and run when it returns. */
export function OfflineBanner() {
  const pending = useOffline(); // a navigation or action is waiting for the network
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  if (online && !pending) return null;
  return (
    <div role="status" className="sticky top-0 z-30 flex items-center justify-center gap-2 bg-warning/90 px-4 py-1.5 text-center text-sm text-black">
      <WifiOff className="size-4" aria-hidden /> You&rsquo;re offline. Saved pages still open; anything you submit will be sent when you&rsquo;re back online.
    </div>
  );
}
