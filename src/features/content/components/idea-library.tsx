import Link from "next/link";
import { Input } from "@/components/ui/form-controls";
import { JourneySetupForm } from "@/features/goals/components/journey-setup-form";
import { cn } from "@/lib/utils";
import { loadIdeas } from "../server/queries";
import { ContentNav } from "./content-nav";
import { IdeaCapture } from "./idea-capture";
import { ItemCard } from "./item-card";

type Params = Record<string, string | string[] | undefined>;

export async function IdeaLibrary({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const pillarId = typeof sp.pillar === "string" && /^[0-9a-f-]{36}$/i.test(sp.pillar) ? sp.pillar : undefined;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 100) : undefined;
  const data = await loadIdeas({ pillarId, q });
  if (!data.ready) return <JourneySetupForm defaultStartDate={data.workspace.today} />;
  const pillarName = new Map(data.pillars.map((p) => [p.id, p.name]));
  const chip = (active: boolean) => cn("rounded-full border px-3 py-1 text-xs", active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent");
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Idea library</h1>
        <p className="text-sm text-muted-foreground">Every idea and topic being researched. Capture fast, pick the best later.</p>
      </div>
      <ContentNav current="/content/ideas" />
      <IdeaCapture pillars={data.pillars} />
      <nav aria-label="Filter by pillar" className="flex flex-wrap gap-1.5">
        <Link href="/content/ideas" className={chip(!pillarId)}>
          All pillars
        </Link>
        {data.pillars.map((p) => (
          <Link key={p.id} href={`/content/ideas?pillar=${p.id}`} className={chip(pillarId === p.id)}>
            {p.name}
          </Link>
        ))}
      </nav>
      <form action="/content/ideas" className="flex gap-2">
        {pillarId ? <input type="hidden" name="pillar" value={pillarId} /> : null}
        <Input name="q" defaultValue={q ?? ""} placeholder="Search ideas…" aria-label="Search ideas" />
      </form>
      {data.ideas.length === 0 ? <p className="text-sm text-muted-foreground">No ideas here yet.</p> : null}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.ideas.map((i) => (
          <li key={i.id}>
            <ItemCard item={i} pillarName={i.pillarId ? pillarName.get(i.pillarId) : undefined} today={data.today} />
          </li>
        ))}
      </ul>
    </div>
  );
}
