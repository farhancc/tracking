"use client";

import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form-controls";

type Step = "credentials" | "mfa" | "setup" | "codes" | "recovery-notice";

async function post(path: string, body: unknown) {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message ?? "Something went wrong. Try again.");
  return data;
}

function Alert({ message }: { message: string | null }) {
  return message ? (
    <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive-ink">
      {message}
    </p>
  ) : null;
}

export function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next") ?? "/today";
  const [step, setStep] = useState<Step>("credentials");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [useRecovery, setUseRecovery] = useState(false);
  const [setup, setSetup] = useState<{ secret: string; qrSvg: string } | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [left, setLeft] = useState<number | null>(null);

  const go = (path: string) => window.location.assign(path.startsWith("/") && !path.startsWith("//") ? path : "/today");

  async function run(e: FormEvent<HTMLFormElement>, fn: (fd: FormData) => Promise<void>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await fn(new FormData(e.currentTarget));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  if (step === "credentials") {
    return (
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) =>
          run(e, async (fd) => {
            const r = await post("/api/auth/login", { email: fd.get("email"), password: fd.get("password") });
            if (r.next === "setup") {
              const s = await post("/api/auth/mfa/setup", {});
              setSetup({ secret: s.secret, qrSvg: s.qrSvg });
              setStep("setup");
            } else setStep("mfa");
          })
        }
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="username" required autoFocus />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        <Alert message={error} />
        <Button type="submit" disabled={busy}>
          {busy ? "Checking…" : "Continue"}
        </Button>
      </form>
    );
  }

  if (step === "mfa") {
    return (
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) =>
          run(e, async (fd) => {
            const body = useRecovery ? { recoveryCode: fd.get("recoveryCode"), next } : { code: fd.get("code"), next };
            const r = await post("/api/auth/mfa", body);
            if (r.usedRecoveryCode) {
              setLeft(r.recoveryCodesLeft);
              setStep("recovery-notice");
            } else go(r.next);
          })
        }
      >
        {useRecovery ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="recoveryCode">Recovery code</Label>
            <Input id="recoveryCode" name="recoveryCode" autoComplete="off" autoCapitalize="none" spellCheck={false} required autoFocus placeholder="xxxxx-xxxxx" />
            <p className="text-xs text-muted-foreground">Each recovery code works once.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="code">6-digit code from your authenticator app</Label>
            <Input id="code" name="code" inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="one-time-code" required autoFocus className="text-lg tracking-widest" />
          </div>
        )}
        <Alert message={error} />
        <Button type="submit" disabled={busy}>
          {busy ? "Verifying…" : "Sign in"}
        </Button>
        <button type="button" className="text-sm underline underline-offset-2" onClick={() => (setUseRecovery(!useRecovery), setError(null))}>
          {useRecovery ? "Use the authenticator code instead" : "Lost your phone? Use a recovery code"}
        </button>
      </form>
    );
  }

  if (step === "recovery-notice") {
    return (
      <div className="flex flex-col gap-3" role="status">
        <p className="text-sm">You signed in with a recovery code. {left} left.</p>
        <p className="text-sm text-muted-foreground">If you lost your authenticator, create new recovery codes in Settings → Security, and ask the owner CLI to reset the authenticator (see the user guide).</p>
        <Button onClick={() => go(next)}>Continue</Button>
      </div>
    );
  }

  if (step === "setup" && setup) {
    return (
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) =>
          run(e, async (fd) => {
            const r = await post("/api/auth/mfa/setup/confirm", { code: fd.get("code") });
            setCodes(r.recoveryCodes);
            setStep("codes");
          })
        }
      >
        <p className="text-sm">Two-step sign-in is required. Scan this code with an authenticator app (for example Google Authenticator, 1Password or Aegis), then enter the 6-digit code it shows.</p>
        {/* The SVG is generated on our server by the qrcode library from our own otpauth URL. */}
        <div className="mx-auto w-48 rounded-md bg-white p-2 [&_svg]:h-auto [&_svg]:w-full" role="img" aria-label="QR code for your authenticator app" dangerouslySetInnerHTML={{ __html: setup.qrSvg }} />
        <details className="text-sm">
          <summary className="cursor-pointer">Can&apos;t scan? Enter the key by hand</summary>
          <p className="mt-1 break-all font-mono text-xs">{setup.secret.match(/.{1,4}/g)?.join(" ")}</p>
        </details>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="setup-code">6-digit code</Label>
          <Input id="setup-code" name="code" inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="one-time-code" required className="text-lg tracking-widest" />
        </div>
        <Alert message={error} />
        <Button type="submit" disabled={busy}>
          {busy ? "Checking…" : "Turn on two-step sign-in"}
        </Button>
      </form>
    );
  }

  // Recovery codes, shown once.
  const text = codes.join("\n");
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium">Save your recovery codes</p>
      <p className="text-sm text-muted-foreground">If you lose your phone, each of these lets you sign in once. They won&apos;t be shown again.</p>
      <ul className="grid grid-cols-2 gap-1 rounded-md border p-3 font-mono text-sm" aria-label="Recovery codes">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={() => navigator.clipboard?.writeText(text)}>
          Copy
        </Button>
        <a className="inline-flex h-9 items-center rounded-md border px-3 text-sm" href={`data:text/plain;charset=utf-8,${encodeURIComponent(`FiveYearOS recovery codes\n\n${text}\n`)}`} download="fiveyearos-recovery-codes.txt">
          Download
        </a>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="size-5 accent-primary" checked={saved} onChange={(e) => setSaved(e.target.checked)} /> I&apos;ve saved these codes somewhere safe
      </label>
      <Button disabled={!saved} onClick={() => go(next)}>
        Continue
      </Button>
    </div>
  );
}
