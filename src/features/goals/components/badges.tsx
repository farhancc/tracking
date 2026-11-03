import { Badge } from "@/components/ui/badge";
import {
  GOAL_HEALTH_LABELS,
  GOAL_LEVEL_LABELS,
  GOAL_PRIORITY_LABELS,
  GOAL_STATUS_LABELS,
  type GoalHealth,
  type GoalLevel,
  type GoalPriority,
  type GoalStatus,
} from "@/lib/domain/goals";

export function LevelBadge({ level }: { level: GoalLevel }) {
  return (
    <Badge variant="outline" className="font-normal">
      {GOAL_LEVEL_LABELS[level]}
    </Badge>
  );
}

const statusVariant: Record<GoalStatus, "secondary" | "success" | "warning" | "destructive" | "outline"> = {
  not_started: "outline",
  in_progress: "secondary",
  at_risk: "warning",
  on_hold: "outline",
  achieved: "success",
  missed: "destructive",
  abandoned: "outline",
};

export function StatusBadge({ status }: { status: GoalStatus }) {
  return <Badge variant={statusVariant[status]}>{GOAL_STATUS_LABELS[status]}</Badge>;
}

export function PriorityBadge({ priority }: { priority: number }) {
  const p = priority as GoalPriority;
  return (
    <Badge variant={p === 1 ? "destructive" : p === 2 ? "warning" : "outline"} className="font-normal">
      {GOAL_PRIORITY_LABELS[p]}
    </Badge>
  );
}

export const healthTone: Record<GoalHealth, "default" | "success" | "warning" | "destructive"> = {
  achieved: "success",
  target_met: "success",
  closed: "default",
  upcoming: "default",
  on_track: "success",
  at_risk: "warning",
  off_track: "destructive",
  overdue: "destructive",
};

/** Advisory pace signal. Hidden for closed goals, where the status badge already says it all. */
export function HealthBadge({ health }: { health: GoalHealth }) {
  if (health === "achieved" || health === "closed") return null;
  const tone = healthTone[health];
  const variant = tone === "default" ? "outline" : tone;
  return <Badge variant={variant}>{GOAL_HEALTH_LABELS[health]}</Badge>;
}

export function PillarTag({ pillar }: { pillar?: { name: string; color: string } | null }) {
  if (!pillar) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="size-2 rounded-full" style={{ backgroundColor: pillar.color }} aria-hidden />
      {pillar.name}
    </span>
  );
}
