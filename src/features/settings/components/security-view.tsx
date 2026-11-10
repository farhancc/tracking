import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/current-user";
import { loadSecurityOverview } from "@/lib/auth/routes";
import { ChangePasswordForm, RegenerateRecoveryCodes, RevokeSessionButton, SignOutEverywhere } from "./security-actions";

const EVENT_LABELS: Record<string, string> = {
  password_ok: "Password accepted",
  mfa_ok: "Signed in",
  recovery_code_used: "Signed in with a recovery code",
  login_fail: "Wrong password",
  mfa_fail: "Wrong authenticator code",
  mfa_replay: "Reused authenticator code rejected",
  recovery_fail: "Wrong recovery code",
  login_locked: "Attempt while locked",
  account_locked: "Sign-in locked after failed attempts",
  rate_limited: "Too many attempts from a network",
  mfa_enrolled: "Authenticator set up",
  mfa_setup_fail: "Authenticator setup code rejected",
  logout: "Signed out",
  logout_all: "Signed out everywhere",
  session_revoked: "Session revoked",
  reuse_detected: "Stolen session token detected; session revoked",
  password_changed: "Password changed",
  password_change_fail: "Password change rejected",
  recovery_codes_regenerated: "New recovery codes",
  owner_created: "Owner account created",
  owner_reset: "Owner reset from the command line",
};

function device(ua: string | null) {
  if (!ua) return "Unknown device";
  if (ua === "cli") return "Command line";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  return `${browser} on ${os}`;
}

export async function SecurityView() {
  const user = await requireUser();
  const s = await loadSecurityOverview(user.userId);
  const fmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Security</h1>
        <p className="text-sm text-muted-foreground">
          {s.email ?? "Owner"} · two-step sign-in {s.mfaEnabledAt ? `on since ${fmt.format(s.mfaEnabledAt)}` : "not set up"} · {s.recoveryCodesLeft} recovery codes left
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Signed-in devices</CardTitle>
          <CardDescription>Each stays signed in for up to 30 days of inactivity and 90 days at most.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <ul className="flex flex-col divide-y">
            {s.sessions.map((x) => (
              <li key={x.id} className="flex min-w-0 items-start justify-between gap-3 py-2">
                <span className="min-w-0 text-sm">
                  <span className="block">
                    {device(x.userAgent)}
                    {x.id === user.sessionId ? <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs">This device</span> : null}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Signed in {fmt.format(x.createdAt)} · last active {fmt.format(x.lastUsedAt)}
                    {x.ipPrefix ? ` · network ${x.ipPrefix}` : ""}
                  </span>
                </span>
                <RevokeSessionButton id={x.id} current={x.id === user.sessionId} />
              </li>
            ))}
          </ul>
          <SignOutEverywhere />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Change password</CardTitle>
          <CardDescription>Needs your current password and an authenticator code. Every other device is signed out.</CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recovery codes</CardTitle>
          <CardDescription>Use one to sign in if you lose your phone. Creating new codes cancels the old ones.</CardDescription>
        </CardHeader>
        <CardContent>
          <RegenerateRecoveryCodes />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent activity</CardTitle>
          <CardDescription>The last 50 sign-in events. Networks are shown by prefix only.</CardDescription>
        </CardHeader>
        <CardContent>
          {s.events.length === 0 ? <p className="text-sm text-muted-foreground">No events yet.</p> : null}
          <ul className="flex flex-col divide-y text-sm">
            {s.events.map((e, i) => (
              <li key={i} className="flex flex-wrap justify-between gap-x-3 py-1.5">
                <span>{EVENT_LABELS[e.type] ?? e.type}</span>
                <span className="text-xs text-muted-foreground">
                  {fmt.format(e.createdAt)} · {device(e.userAgent)}
                  {e.ipPrefix ? ` · ${e.ipPrefix}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
