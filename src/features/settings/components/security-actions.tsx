"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form-controls";

async function post(path: string, body: unknown) {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message ?? "Something went wrong.");
  return data;
}

function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const run = async (fn: () => Promise<string | null>) => {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      setDone(await fn());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };
  const status = (
    <>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {done ? (
        <p role="status" className="text-sm text-success">
          {done}
        </p>
      ) : null}
    </>
  );
  return { busy, run, status };
}

export function ChangePasswordForm() {
  const a = useAction();
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const form = e.currentTarget;
        if (fd.get("newPassword") !== fd.get("confirm")) return void a.run(async () => Promise.reject(new Error("The new passwords don't match.")));
        a.run(async () => {
          await post("/api/auth/password", { currentPassword: fd.get("currentPassword"), newPassword: fd.get("newPassword"), code: fd.get("code") });
          form.reset();
          return "Password changed. Every other device has been signed out.";
        });
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="currentPassword">Current password</Label>
        <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="newPassword">New password (at least 12 characters)</Label>
        <Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" minLength={12} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirm">Repeat the new password</Label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={12} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="pw-code">Authenticator code</Label>
        <Input id="pw-code" name="code" inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="one-time-code" required className="w-36" />
      </div>
      {a.status}
      <div>
        <Button type="submit" disabled={a.busy}>
          {a.busy ? "Saving…" : "Change password"}
        </Button>
      </div>
    </form>
  );
}

export function RevokeSessionButton({ id, current }: { id: string; current: boolean }) {
  const router = useRouter();
  const a = useAction();
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="ghost"
        size="sm"
        disabled={a.busy}
        onClick={() =>
          a.run(async () => {
            const r = await post("/api/auth/sessions/revoke", { sessionId: id });
            // A full load (not router.push) drops the client router cache, which holds personal data.
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination
            if (r.current) window.location.assign("/login");
            else router.refresh();
            return null;
          })
        }
      >
        {current ? "Sign out" : "Revoke"}
      </Button>
      {a.status}
    </div>
  );
}

export function SignOutEverywhere() {
  const a = useAction();
  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button
          variant="outline"
          disabled={a.busy}
          onClick={() =>
            a.run(async () => {
              if (!window.confirm("Sign out of every device, including this one?")) return null;
              await post("/api/auth/logout-all", {});
              navigator.serviceWorker?.controller?.postMessage("clear-pages");
              // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full load drops cached personal data
              window.location.assign("/login");
              return null;
            })
          }
        >
          Sign out everywhere
        </Button>
      </div>
      {a.status}
    </div>
  );
}

export function RegenerateRecoveryCodes() {
  const a = useAction();
  const [codes, setCodes] = useState<string[] | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          a.run(async () => {
            const r = await post("/api/auth/recovery-codes", { code: fd.get("code") });
            setCodes(r.recoveryCodes);
            return "New codes created. The old ones no longer work.";
          });
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rc-code">Authenticator code</Label>
          <Input id="rc-code" name="code" inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="one-time-code" required className="w-36" />
        </div>
        <Button type="submit" variant="outline" disabled={a.busy}>
          New recovery codes
        </Button>
      </form>
      {a.status}
      {codes ? (
        <ul className="grid grid-cols-2 gap-1 rounded-md border p-3 font-mono text-sm sm:max-w-sm" aria-label="New recovery codes">
          {codes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
