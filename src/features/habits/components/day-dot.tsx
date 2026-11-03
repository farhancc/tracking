import { cn } from "@/lib/utils";
import type { DayState } from "@/lib/domain/habits";

const LABEL: Record<DayState, string> = { done: "done", missed: "missed", rest: "rest", pending: "today, not yet", off: "not scheduled" };

/** One day: filled = done, outlined = missed, dashed = rest, ring = today, faint = not scheduled. Shape, not just colour. */
export function DayDot({ day, state, size = "md" }: { day: string; state: DayState; size?: "sm" | "md" }) {
  return (
    <span
      title={`${day}: ${LABEL[state]}`}
      aria-label={`${day}: ${LABEL[state]}`}
      role="img"
      className={cn(
        "inline-block shrink-0 rounded-full border",
        size === "md" ? "size-4" : "size-3",
        state === "done" && "border-[var(--chart-1)] bg-[var(--chart-1)]",
        state === "missed" && "border-muted-foreground/70 bg-transparent",
        state === "rest" && "border-dashed border-muted-foreground/60",
        state === "pending" && "border-2 border-primary",
        state === "off" && "border-transparent bg-muted",
      )}
    />
  );
}
