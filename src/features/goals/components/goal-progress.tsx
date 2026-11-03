import { Progress } from "@/components/ui/progress";
import { formatMeasure, type MeasureUnit } from "@/lib/domain/goals";
import type { GoalView } from "../server/service";
import { healthTone } from "./badges";

/** Outcome progress: baseline → current → target, with the expected-pace marker. */
export function GoalProgress({ goal, compact = false }: { goal: GoalView; compact?: boolean }) {
  const unit = goal.unit as MeasureUnit;
  const fmt = (v: number) => formatMeasure(v, unit, goal.currency);
  return (
    <div className="flex flex-col gap-1.5">
      <Progress
        value={goal.completionPct}
        expected={goal.status === "achieved" ? undefined : goal.expectedPct}
        tone={healthTone[goal.health]}
        label={`${goal.title}: ${goal.completionPct}% of target`}
      />
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs text-muted-foreground">
        <span>
          <span className="font-medium text-foreground">{goal.completionPct}%</span>
          {compact ? null : <> · {goal.successMetric}</>}
        </span>
        {goal.measurementMode === "key_results" ? (
          <span>measured by key results</span>
        ) : (
          <span>
            {fmt(goal.currentValue)} <span aria-hidden>→</span> {fmt(goal.targetValue)}
            {compact ? null : <> (from {fmt(goal.baselineValue)})</>}
          </span>
        )}
      </div>
    </div>
  );
}
