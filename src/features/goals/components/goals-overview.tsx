import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { diffDays } from "@/lib/domain/dates";
import { GOAL_LEVEL_LABELS, GOAL_LEVELS, GOAL_STATUS_LABELS, GOAL_STATUSES, type GoalStatus } from "@/lib/domain/goals";
import { cn } from "@/lib/utils";
import { loadGoalTree } from "../server/queries";
import { GoalTree, pruneTree } from "./goal-tree";
import { JourneySetupForm } from "./journey-setup-form";

export async function GoalsOverview({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [data, params] = await Promise.all([loadGoalTree(), searchParams]);
  if (!data.ready) return <JourneySetupForm defaultStartDate={data.workspace.today} />;

  const { workspace, vision, tree, total, byLevel } = data;
  const pillarFilter = typeof params.pillar === "string" ? params.pillar : undefined;
  const statusFilter = typeof params.status === "string" && (GOAL_STATUSES as readonly string[]).includes(params.status)
    ? (params.status as GoalStatus)
    : undefined;
  const visible =
    pillarFilter || statusFilter
      ? pruneTree(tree, (n) => (!pillarFilter || n.pillarId === pillarFilter) && (!statusFilter || n.status === statusFilter))
      : tree;

  const day = Math.min(diffDays(workspace.journey.startDate, workspace.today) + 1, diffDays(workspace.journey.startDate, workspace.journey.endDate) + 1);
  const totalDays = diffDays(workspace.journey.startDate, workspace.journey.endDate) + 1;

  const href = (next: { pillar?: string; status?: string }) => {
    const q = new URLSearchParams();
    if (next.pillar) q.set("pillar", next.pillar);
    if (next.status) q.set("status", next.status);
    const s = q.toString();
    return s ? `/goals?${s}` : "/goals";
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>{vision?.title ?? "Five-year vision"}</CardTitle>
            <CardDescription>
              {day > 0 ? `Day ${day} of ${totalDays}` : `Starts ${workspace.journey.startDate}`} · {workspace.journey.name}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {vision ? (
              <p className="line-clamp-4 whitespace-pre-wrap text-sm">{vision.statement}</p>
            ) : (
              <p className="text-sm text-muted-foreground">No vision written yet.</p>
            )}
            <Link href="/goals/vision" className="mt-3 inline-block text-sm font-medium underline-offset-4 hover:underline">
              {vision ? "Open vision" : "Write your vision"}
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{total} goals</CardTitle>
            <CardDescription>Across the hierarchy</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[1fr_auto] gap-y-1 text-sm">
              {GOAL_LEVELS.map((l) => (
                <div key={l} className="contents">
                  <dt className="text-muted-foreground">{GOAL_LEVEL_LABELS[l]}</dt>
                  <dd className="tabular-nums">{byLevel[l]}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </div>

      <nav aria-label="Filter goals" className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-1.5">
          <FilterChip href={href({ status: statusFilter })} active={!pillarFilter}>
            All pillars
          </FilterChip>
          {workspace.pillars.map((p) => (
            <FilterChip key={p.id} href={href({ pillar: p.id, status: statusFilter })} active={pillarFilter === p.id}>
              <span className="size-2 rounded-full" style={{ backgroundColor: p.color }} aria-hidden /> {p.name}
            </FilterChip>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <FilterChip href={href({ pillar: pillarFilter })} active={!statusFilter}>
            Any status
          </FilterChip>
          {GOAL_STATUSES.map((s) => (
            <FilterChip key={s} href={href({ pillar: pillarFilter, status: s })} active={statusFilter === s}>
              {GOAL_STATUS_LABELS[s]}
            </FilterChip>
          ))}
        </div>
      </nav>

      {total === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Start at the top</CardTitle>
            <CardDescription>
              Write your vision, then add five-year goals: a financial target, business ownership, skills, personal brand
              and exit conditions. Break each into annual, quarterly, monthly, weekly and daily goals.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-3 text-sm">
            <Link href="/goals/vision" className="font-medium underline-offset-4 hover:underline">
              Define the vision →
            </Link>
          </CardContent>
        </Card>
      ) : visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">No goals match these filters.</p>
      ) : (
        <GoalTree nodes={visible} pillars={workspace.pillars} />
      )}
    </div>
  );
}

function FilterChip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs",
        active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent",
      )}
    >
      {children}
    </Link>
  );
}
