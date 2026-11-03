import { ActionForm } from "@/components/action-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form-controls";
import { DEFAULT_YEAR_DIRECTIONS } from "@/lib/domain/roadmap";
import { generateRoadmapAction } from "../server/actions";

export function GenerateRoadmapCard({ weeklyCapacityHours }: { weeklyCapacityHours: number }) {
  return (
    <Card className="mx-auto max-w-2xl">
      <CardHeader>
        <CardTitle>Generate your five-year roadmap</CardTitle>
        <CardDescription>
          This splits your journey into 5 annual plans and 20 quarterly cycles, with review dates. Each year starts with a
          provisional direction you can edit. No targets are invented: you set objectives and key results yourself, and
          the app checks them against your available time and track record.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ol className="flex flex-col gap-2 text-sm">
          {DEFAULT_YEAR_DIRECTIONS.map((d, i) => (
            <li key={d.theme} className="rounded-lg border p-3">
              <span className="font-medium">
                Year {i + 1} · {d.theme}
              </span>
              <p className="text-muted-foreground">{d.direction}</p>
            </li>
          ))}
        </ol>
        <ActionForm action={generateRoadmapAction} submitLabel="Generate roadmap" pendingLabel="Generating…">
          <Field
            label="Hours per week you can realistically give the plan"
            htmlFor="weeklyCapacityHours"
            hint="Outside your job and obligations. You can change it per quarter later."
          >
            <Input
              id="weeklyCapacityHours"
              name="weeklyCapacityHours"
              type="number"
              min={0}
              max={120}
              step="0.5"
              defaultValue={weeklyCapacityHours}
              className="max-w-32"
              required
            />
          </Field>
        </ActionForm>
      </CardContent>
    </Card>
  );
}
