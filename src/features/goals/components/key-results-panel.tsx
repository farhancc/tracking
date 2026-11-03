import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Field, Input, Select } from "@/components/ui/form-controls";
import { MEASURE_UNIT_LABELS, MEASURE_UNITS } from "@/lib/domain/goals";
import { addKeyResultAction } from "../server/actions";
import type { GoalView } from "../server/service";
import { GoalProgress } from "./goal-progress";

/** Key results of an objective, with an inline form to add one. */
export function KeyResultsPanel({
  objective,
  keyResults,
  baseCurrency,
  compact = false,
}: {
  objective: Pick<GoalView, "id" | "title">;
  keyResults: GoalView[];
  baseCurrency: string;
  compact?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      {keyResults.length === 0 ? (
        <p className="text-sm text-muted-foreground">No key results yet. Add two to four measurable outcomes that prove this objective.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {keyResults.map((kr) => (
            <li key={kr.id} className="flex flex-col gap-1.5 rounded-lg border p-3">
              <Link href={`/goals/${kr.id}`} className="text-sm font-medium hover:underline">
                {kr.title}
              </Link>
              <GoalProgress goal={kr} compact={compact} />
            </li>
          ))}
        </ul>
      )}
      <details className="rounded-lg border p-3">
        <summary className="cursor-pointer text-sm font-medium">Add key result</summary>
        <ActionForm action={addKeyResultAction.bind(null, objective.id)} submitLabel="Add key result" submitVariant="outline" className="mt-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Key result" htmlFor={`kr-title-${objective.id}`} className="sm:col-span-2">
              <Input id={`kr-title-${objective.id}`} name="title" placeholder="e.g. 20 customer interviews completed" required maxLength={200} />
            </Field>
            <Field label="Success metric" htmlFor={`kr-metric-${objective.id}`}>
              <Input id={`kr-metric-${objective.id}`} name="successMetric" placeholder="e.g. Interviews" maxLength={200} />
            </Field>
            <Field label="Unit" htmlFor={`kr-unit-${objective.id}`}>
              <Select id={`kr-unit-${objective.id}`} name="unit" defaultValue="count">
                {MEASURE_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {MEASURE_UNIT_LABELS[u]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Measured as" htmlFor={`kr-mode-${objective.id}`}>
              <Select id={`kr-mode-${objective.id}`} name="measurementMode" defaultValue="cumulative">
                <option value="cumulative">Running total</option>
                <option value="latest">Latest value</option>
              </Select>
            </Field>
            <Field label="Currency (money only)" htmlFor={`kr-currency-${objective.id}`}>
              <Input id={`kr-currency-${objective.id}`} name="currency" defaultValue={baseCurrency} maxLength={3} className="uppercase" />
            </Field>
            <Field label="Baseline" htmlFor={`kr-baseline-${objective.id}`}>
              <Input id={`kr-baseline-${objective.id}`} name="baselineValue" type="number" step="any" defaultValue="0" required />
            </Field>
            <Field label="Target" htmlFor={`kr-target-${objective.id}`}>
              <Input id={`kr-target-${objective.id}`} name="targetValue" type="number" step="any" required />
            </Field>
          </div>
        </ActionForm>
      </details>
    </div>
  );
}
