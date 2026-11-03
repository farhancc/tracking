import { Smartphone } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/form-controls";
import { WEEKDAY_LABELS } from "@/lib/domain/daily";
import { NOTIFICATION_KINDS, NOTIFICATION_LABELS } from "@/lib/domain/notifications";
import { removeDeviceAction, savePreferencesAction, sendTestAction } from "../server/actions";
import { loadNotificationSettings } from "../server/queries";
import { PushSetup } from "./push-setup";

function device(ua: string | null) {
  if (!ua) return "Unknown device";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "Device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "browser";
  return `${browser} on ${os}`;
}

export async function NotificationSettingsView() {
  const s = await loadNotificationSettings();
  const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: s.timezone });
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Notification settings</h1>
        <p className="text-sm text-muted-foreground">Times are in your time zone ({s.timezone}). Each reminder is sent at most once per day, and only if there&apos;s something to act on.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Reminders</CardTitle>
          <CardDescription>Turn each one on or off and choose when it arrives.</CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={savePreferencesAction} submitLabel="Save settings" resetOnSuccess={false}>
            <ul className="flex flex-col divide-y">
              {NOTIFICATION_KINDS.map((k) => {
                const pref = s.prefs[k];
                return (
                  <li key={k} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 first:pt-0">
                    <label className="flex min-h-11 min-w-0 flex-1 basis-56 items-start gap-3">
                      <input type="checkbox" name={`${k}.enabled`} defaultChecked={pref.enabled} className="mt-1 size-5 shrink-0 accent-primary" />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{NOTIFICATION_LABELS[k].label}</span>
                        <span className="block text-xs text-muted-foreground">{NOTIFICATION_LABELS[k].description}</span>
                      </span>
                    </label>
                    <div className="flex items-center gap-2">
                      {k === "weekly_review" ? (
                        <>
                          <Label htmlFor="weekly-weekday" className="sr-only">
                            Weekly review day
                          </Label>
                          <Select id="weekly-weekday" name="weekly_review.weekday" defaultValue={String(s.prefs.weekly_review.weekday)} className="w-24">
                            {WEEKDAY_LABELS.map((d, i) => (
                              <option key={d} value={i}>
                                {d}
                              </option>
                            ))}
                          </Select>
                        </>
                      ) : null}
                      {"time" in pref ? (
                        <>
                          <Label htmlFor={`${k}-time`} className="sr-only">
                            {NOTIFICATION_LABELS[k].label} time
                          </Label>
                          <Input id={`${k}-time`} type="time" name={`${k}.time`} defaultValue={pref.time} required className="w-32" />
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">When it happens</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            <fieldset className="flex flex-col gap-2 border-t pt-3">
              <legend className="text-sm font-medium">Quiet hours</legend>
              <p className="text-xs text-muted-foreground">Reminders still reach the inbox during quiet hours; they just aren&apos;t pushed. Leave both empty to turn quiet hours off.</p>
              <div className="flex flex-wrap items-center gap-2">
                <Label htmlFor="quiet-start">From</Label>
                <Input id="quiet-start" type="time" name="quietStart" defaultValue={s.prefs.quietStart ?? ""} className="w-32" />
                <Label htmlFor="quiet-end">to</Label>
                <Input id="quiet-end" type="time" name="quietEnd" defaultValue={s.prefs.quietEnd ?? ""} className="w-32" />
              </div>
            </fieldset>
            <label className="flex min-h-11 items-start gap-3 border-t pt-3">
              <input type="checkbox" name="push" defaultChecked={s.prefs.push} className="mt-1 size-5 shrink-0 accent-primary" />
              <span>
                <span className="block text-sm font-medium">Push to my devices</span>
                <span className="block text-xs text-muted-foreground">Off: reminders appear only in the in-app inbox.</span>
              </span>
            </label>
          </ActionForm>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">This device</CardTitle>
          <CardDescription>Push needs permission on each phone or computer you use.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <PushSetup vapidPublicKey={s.vapidPublicKey} />
          {s.subscriptions.length ? (
            <div>
              <h3 className="mb-2 text-sm font-medium">Devices receiving push</h3>
              <ul className="flex flex-col gap-2">
                {s.subscriptions.map((d) => (
                  <li key={d.id} className="flex min-w-0 items-center gap-3 rounded-md border p-2">
                    <Smartphone className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="block truncate">{device(d.userAgent)}</span>
                      <span className="block text-xs text-muted-foreground">
                        Added {dateFmt.format(d.createdAt)}
                        {d.lastSuccessAt ? ` · last delivered ${dateFmt.format(d.lastSuccessAt)}` : " · nothing delivered yet"}
                        {d.failures ? ` · ${d.failures} failed` : ""}
                      </span>
                    </span>
                    <form action={removeDeviceAction.bind(null, d.id)}>
                      <SubmitButton variant="ghost" className="h-10 px-2 text-xs" aria-label={`Remove ${device(d.userAgent)}`}>
                        Remove
                      </SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <ActionForm action={sendTestAction} submitLabel="Send a test notification" pendingLabel="Sending…" submitVariant="outline" resetOnSuccess={false}>
            <p className="text-xs text-muted-foreground">Adds a test item to your inbox and pushes it to every subscribed device.</p>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
