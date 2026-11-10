import { Bell, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Settings" };

const ITEMS = [
  { href: "/settings/notifications", icon: Bell, title: "Notifications", text: "Reminders, quiet hours and push on this device." },
  { href: "/settings/security", icon: ShieldCheck, title: "Security", text: "Signed-in devices, password, recovery codes and sign-in activity." },
];

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <ul className="grid gap-3 sm:grid-cols-2">
        {ITEMS.map((i) => (
          <li key={i.href}>
            <Link href={i.href} className="flex min-h-11 items-start gap-3 rounded-xl border bg-card p-4 hover:bg-accent">
              <i.icon className="mt-0.5 size-5 shrink-0" aria-hidden />
              <span>
                <span className="block font-medium">{i.title}</span>
                <span className="block text-sm text-muted-foreground">{i.text}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
