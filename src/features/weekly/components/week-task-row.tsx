import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/form-controls";
import { TASK_PRIORITY_LABELS, formatMinutes } from "@/lib/domain/weekly";
import { cn } from "@/lib/utils";
import { logTaskTimeAction, toggleTaskAction } from "../server/actions";
import type { TaskRow } from "../server/service";

export function WeekTaskRow({ task }: { task: TaskRow }) {
  const done = task.status === "done";
  return (
    <li className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <form action={toggleTaskAction.bind(null, task.id, !done)}>
          <SubmitButton
            variant="outline"
            size="icon"
            className={cn("size-8", done && "border-success bg-success/10 text-success")}
            aria-label={done ? `Mark ${task.title} as not done` : `Mark ${task.title} as done`}
          >
            {done ? "✓" : ""}
          </SubmitButton>
        </form>
        <div className="min-w-0">
          <p className={cn("text-sm", done && "text-muted-foreground line-through")}>{task.title}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {task.isDeliverable ? <Badge variant="success">Deliverable</Badge> : null}
            {task.priority <= 2 ? <Badge variant={task.priority === 1 ? "destructive" : "warning"}>{TASK_PRIORITY_LABELS[task.priority]}</Badge> : null}
            {task.dueOn ? <span>due {task.dueOn}</span> : null}
            {task.estimatedMinutes ? <span>est. {formatMinutes(task.estimatedMinutes)}</span> : null}
            {task.actualMinutes ? <span>actual {formatMinutes(task.actualMinutes)}</span> : null}
            {task.carryCount > 0 ? <span className={task.carryCount >= 2 ? "text-warning" : undefined}>carried ×{task.carryCount}</span> : null}
          </div>
        </div>
      </div>
      <ActionForm
        action={logTaskTimeAction.bind(null, task.id)}
        submitLabel="Log time"
        submitVariant="outline"
        resetOnSuccess={false}
        inline className="items-center gap-2 pl-11 sm:pl-0"
        submitClassName="h-8"
      >
        <Input
          name="actualMinutes"
          defaultValue={task.actualMinutes ?? ""}
          placeholder="e.g. 1h 30m"
          aria-label={`Actual time for ${task.title}`}
          className="h-8 w-28"
        />
      </ActionForm>
    </li>
  );
}
