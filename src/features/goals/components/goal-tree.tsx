import { ChevronRight, Lock, Plus } from "lucide-react";
import Link from "next/link";
import {
  GOAL_CATEGORY_LABELS,
  GOAL_LEVEL_LABELS,
  defaultChildLevel,
  type GoalCategory,
  type GoalLevel,
  type GoalStatus,
} from "@/lib/domain/goals";
import type { GoalTreeNode, PillarRow } from "../server/service";
import { HealthBadge, PillarTag, StatusBadge } from "./badges";
import { GoalProgress } from "./goal-progress";

/** Keeps nodes that match, plus their ancestors (so the hierarchy stays readable). */
export function pruneTree(nodes: GoalTreeNode[], match: (n: GoalTreeNode) => boolean): GoalTreeNode[] {
  const out: GoalTreeNode[] = [];
  for (const node of nodes) {
    const children = pruneTree(node.children, match);
    if (match(node) || children.length > 0) out.push({ ...node, children });
  }
  return out;
}

export function GoalTree({ nodes, pillars }: { nodes: GoalTreeNode[]; pillars: PillarRow[] }) {
  const pillarById = new Map(pillars.map((p) => [p.id, p]));
  return (
    <ul className="flex flex-col gap-2" aria-label="Goal hierarchy">
      {nodes.map((node) => (
        <GoalTreeItem key={node.id} node={node} pillarById={pillarById} depth={0} />
      ))}
    </ul>
  );
}

function GoalTreeItem({
  node,
  pillarById,
  depth,
}: {
  node: GoalTreeNode;
  pillarById: Map<string, PillarRow>;
  depth: number;
}) {
  const nextLevel = defaultChildLevel(node.level as GoalLevel);
  const row = (
    <div className="flex flex-col gap-2 rounded-lg border bg-card p-3 sm:flex-row sm:items-center sm:gap-4">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {node.isKeyResult ? "Key result" : GOAL_LEVEL_LABELS[node.level as GoalLevel]}
            {node.level === "five_year" && node.category
              ? ` · ${GOAL_CATEGORY_LABELS[node.category as GoalCategory]}`
              : null}
          </span>
          <PillarTag pillar={pillarById.get(node.pillarId)} />
          {node.blockedBy > 0 ? (
            <span className="inline-flex items-center gap-1 text-xs text-warning-ink" title="Blocked by unachieved prerequisites">
              <Lock className="size-3" aria-hidden /> Blocked by {node.blockedBy}
            </span>
          ) : null}
        </div>
        <Link href={`/goals/${node.id}`} className="truncate font-medium hover:underline">
          {node.title}
        </Link>
        <div className="flex flex-wrap gap-1.5">
          <StatusBadge status={node.status as GoalStatus} />
          <HealthBadge health={node.health} />
        </div>
      </div>
      <div className="w-full sm:w-64">
        <GoalProgress goal={node} compact />
      </div>
      {nextLevel ? (
        <Link
          href={`/goals/new?parentId=${node.id}&level=${nextLevel}`}
          className="inline-flex items-center gap-1 self-start text-xs text-muted-foreground hover:text-foreground sm:self-center"
          aria-label={`Add a ${GOAL_LEVEL_LABELS[nextLevel]} under ${node.title}`}
        >
          <Plus className="size-3" aria-hidden /> {GOAL_LEVEL_LABELS[nextLevel]}
        </Link>
      ) : null}
    </div>
  );

  // A plain nested list: links stay outside <summary> (no nested interactive content),
  // and the disclosure only toggles the sub-goals.
  return (
    <li>
      {row}
      {node.children.length > 0 ? (
        <details open={depth < 2} className="group mt-1">
          <summary className="ml-1 inline-flex min-h-9 cursor-pointer list-none items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
            <ChevronRight className="size-4 shrink-0 transition-transform group-open:rotate-90" aria-hidden />
            {node.children.length} {node.children.length === 1 ? "sub-goal" : "sub-goals"}
            <span className="sr-only"> of {node.title}</span>
          </summary>
          <ul className="mt-1 flex flex-col gap-2 border-l pl-3 sm:ml-2.5 sm:pl-4">
            {node.children.map((child) => (
              <GoalTreeItem key={child.id} node={child} pillarById={pillarById} depth={depth + 1} />
            ))}
          </ul>
        </details>
      ) : null}
    </li>
  );
}
