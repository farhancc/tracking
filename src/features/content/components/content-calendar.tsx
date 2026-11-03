import Link from "next/link";
import { JourneySetupForm } from "@/features/goals/components/journey-setup-form";
import { PLATFORM_LABELS, PLATFORM_SHORT } from "@/lib/domain/content";
import { addMonths } from "@/lib/domain/dates";
import { cn } from "@/lib/utils";
import { loadCalendar } from "../server/queries";
import { ContentNav } from "./content-nav";

type Params = Record<string, string | string[] | undefined>;
const KIND_LABEL = { published: "Published", scheduled: "Scheduled", record: "Record" } as const;
const KIND_CLASS = {
  published: "border-l-[var(--chart-1)]",
  scheduled: "border-l-[var(--chart-2)] border-dashed",
  record: "border-l-muted-foreground",
} as const;

export async function ContentCalendar({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const month = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : undefined;
  const data = await loadCalendar(month);
  if (!data.ready) return <JourneySetupForm defaultStartDate={data.workspace.today} />;
  const label = new Date(`${data.month}T00:00:00Z`).toLocaleDateString("en", { month: "long", year: "numeric", timeZone: "UTC" });
  const prev = addMonths(data.month, -1).slice(0, 7);
  const next = addMonths(data.month, 1).slice(0, 7);
  const byDate = new Map<string, typeof data.entries>();
  for (const e of data.entries) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);
  const inMonth = (d: string) => d.slice(0, 7) === data.month.slice(0, 7);
  const days = data.weeks.flat();

  const Entry = ({ e }: { e: (typeof data.entries)[number] }) => (
    <Link href={`/content/${e.item.id}`} className={cn("block truncate rounded border border-l-4 bg-card px-1.5 py-0.5 text-[11px] hover:bg-accent", KIND_CLASS[e.kind])} title={`${KIND_LABEL[e.kind]}: ${e.item.title}`}>
      <span className="sr-only">{KIND_LABEL[e.kind]}: </span>
      {e.item.platform ? <abbr title={PLATFORM_LABELS[e.item.platform]} className="no-underline">{PLATFORM_SHORT[e.item.platform]} · </abbr> : null}
      {e.item.title}
    </Link>
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Content calendar</h1>
        <p className="text-sm text-muted-foreground">Solid: published (actual). Dashed: scheduled (plan). Grey: planned recording.</p>
      </div>
      <ContentNav current="/content/calendar" />
      <div className="flex items-center gap-2">
        <Link href={`/content/calendar?month=${prev}`} className="rounded-md border px-3 py-1 text-sm hover:bg-accent" aria-label="Previous month">
          ←
        </Link>
        <h2 className="min-w-40 text-center font-medium">{label}</h2>
        <Link href={`/content/calendar?month=${next}`} className="rounded-md border px-3 py-1 text-sm hover:bg-accent" aria-label="Next month">
          →
        </Link>
        <Link href="/content/calendar" className="ml-2 text-sm text-muted-foreground underline-offset-2 hover:underline">
          Today
        </Link>
      </div>

      {/* Month grid on wider screens */}
      <div className="hidden md:block">
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border bg-border">
          {data.weeks[0].map((d) => (
            <div key={d} className="bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
              {new Date(`${d}T00:00:00Z`).toLocaleDateString("en", { weekday: "short", timeZone: "UTC" })}
            </div>
          ))}
          {days.map((d) => (
            <div key={d} className={cn("flex min-h-24 flex-col gap-1 bg-background p-1.5", !inMonth(d) && "bg-muted/40 text-muted-foreground")}>
              <span className={cn("text-xs tabular-nums", d === data.today && "w-fit rounded-full bg-primary px-1.5 text-primary-foreground")}>{Number(d.slice(8))}</span>
              {(byDate.get(d) ?? []).map((e) => (
                <Entry key={`${e.kind}-${e.item.id}`} e={e} />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Agenda on phones */}
      <ol className="flex flex-col gap-3 md:hidden">
        {days.filter((d) => inMonth(d) && byDate.has(d)).length === 0 ? <li className="text-sm text-muted-foreground">Nothing planned this month.</li> : null}
        {days
          .filter((d) => inMonth(d) && byDate.has(d))
          .map((d) => (
            <li key={d} className="flex flex-col gap-1">
              <h3 className={cn("text-sm font-medium", d === data.today && "text-primary")}>
                {new Date(`${d}T00:00:00Z`).toLocaleDateString("en", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}
                {d === data.today ? " · today" : ""}
              </h3>
              {byDate.get(d)!.map((e) => (
                <Entry key={`${e.kind}-${e.item.id}`} e={e} />
              ))}
            </li>
          ))}
      </ol>
    </div>
  );
}
