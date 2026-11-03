import { cn } from "@/lib/utils";

/**
 * Outcome progress bar. The optional `expected` marker shows where progress
 * should be by now (elapsed share of the goal's period).
 */
export function Progress({
  value,
  expected,
  tone = "default",
  className,
  label,
}: {
  value: number;
  expected?: number;
  tone?: "default" | "success" | "warning" | "destructive";
  className?: string;
  label?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const fill = {
    default: "bg-primary",
    success: "bg-success",
    warning: "bg-warning",
    destructive: "bg-destructive",
  }[tone];
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      aria-label={label ?? "Progress"}
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-muted", className)}
    >
      <div className={cn("h-full rounded-full transition-all", fill)} style={{ width: `${clamped}%` }} />
      {expected !== undefined && expected > 0 && expected < 100 ? (
        <div
          className="absolute top-0 h-full w-0.5 bg-foreground/60"
          style={{ left: `${expected}%` }}
          title={`Expected by now: ${expected}%`}
        />
      ) : null}
    </div>
  );
}
