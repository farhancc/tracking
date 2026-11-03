"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type Status =
  | { kind: "checking" }
  | { kind: "unsupported"; reason: string }
  | { kind: "denied" }
  | { kind: "off" }
  | { kind: "on" }
  | { kind: "error"; message: string };

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Resolves the active service worker registration, or null if none appears within the timeout. */
async function registration(timeoutMs = 4000): Promise<ServiceWorkerRegistration | null> {
  return Promise.race([navigator.serviceWorker.ready, new Promise<null>((r) => setTimeout(() => r(null), timeoutMs))]);
}

async function send(method: "POST" | "DELETE", body: unknown) {
  const res = await fetch("/api/v1/notifications/subscriptions", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error?.message ?? `Server returned ${res.status}.`);
}

function unsupportedReason(): string | null {
  if (!("serviceWorker" in navigator)) return "This browser has no service worker support.";
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone = window.matchMedia("(display-mode: standalone)").matches;
  if (!("PushManager" in window) || !("Notification" in window)) {
    return ios && !standalone
      ? "On iPhone and iPad, push works only after you add FiveYearOS to the Home Screen (Share → Add to Home Screen) and open it from there."
      : "This browser doesn't support Web Push.";
  }
  return null;
}

/**
 * Enables or disables push on this device. The inbox works without it, so
 * every failure is explained rather than blocking anything.
 */
export function PushSetup({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>({ kind: "checking" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const reason = unsupportedReason();
      let next: Status;
      if (reason) next = { kind: "unsupported", reason };
      else if (Notification.permission === "denied") next = { kind: "denied" };
      else {
        const reg = await registration(1500);
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        // Re-send an existing subscription so the server's copy stays current (idempotent).
        if (sub) await send("POST", sub.toJSON()).catch(() => undefined);
        next = sub ? { kind: "on" } : { kind: "off" };
      }
      if (!cancelled) setStatus(next);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function enable() {
    if (!vapidPublicKey) return;
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? { kind: "denied" } : { kind: "off" });
        return;
      }
      const reg = await registration();
      if (!reg) throw new Error("The offline/push service worker isn't running. Reload the page and try again.");
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(vapidPublicKey) });
      await send("POST", sub.toJSON());
      setStatus({ kind: "on" });
      router.refresh();
    } catch (e) {
      setStatus({ kind: "error", message: e instanceof Error ? e.message : "Couldn't enable push." });
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await registration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        await send("DELETE", { endpoint: sub.endpoint }).catch(() => undefined);
        await sub.unsubscribe();
      }
      setStatus({ kind: "off" });
      router.refresh();
    } catch (e) {
      setStatus({ kind: "error", message: e instanceof Error ? e.message : "Couldn't turn push off." });
    } finally {
      setBusy(false);
    }
  }

  if (!vapidPublicKey) {
    return <p className="text-sm text-muted-foreground">Push isn&apos;t configured on this server (no VAPID keys). Reminders still appear in your inbox.</p>;
  }

  return (
    <div className="flex flex-col gap-2" aria-live="polite">
      {status.kind === "checking" ? <p className="text-sm text-muted-foreground">Checking this device…</p> : null}
      {status.kind === "unsupported" ? <p className="text-sm text-muted-foreground">{status.reason} Reminders still appear in your inbox.</p> : null}
      {status.kind === "denied" ? (
        <p className="text-sm text-muted-foreground">Notifications are blocked for this site. Allow them in your browser&apos;s site settings, then reload.</p>
      ) : null}
      {status.kind === "error" ? (
        <p role="alert" className="text-sm text-destructive">
          {status.message}
        </p>
      ) : null}
      {status.kind === "on" ? <p className="text-sm">Push is on for this device.</p> : null}
      {status.kind === "off" || status.kind === "error" ? (
        <div>
          <Button type="button" onClick={enable} disabled={busy}>
            {busy ? "Enabling…" : "Enable push on this device"}
          </Button>
        </div>
      ) : null}
      {status.kind === "on" ? (
        <div>
          <Button type="button" variant="outline" onClick={disable} disabled={busy}>
            {busy ? "Turning off…" : "Turn off on this device"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
