import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form-controls";
import { JourneySetupForm } from "@/features/goals/components/journey-setup-form";
import { ASSESSMENT_METHOD_LABELS, ASSESSMENT_METHODS } from "@/lib/domain/communication";
import { addAssessmentAction } from "../server/actions";
import { loadCommunication } from "../server/queries";

export async function MonthlyAssessment() {
  const data = await loadCommunication();
  if (!data.ready) return <JourneySetupForm defaultStartDate={data.workspace.today} />;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        {data.summary.assessedThisMonth} of {data.skills.length} skills assessed in {data.month.start.slice(0, 7)}. Rate each skill against
        evidence from this month, not against how much you practised.
      </p>
      <ul className="flex flex-col gap-3">
        {data.skills.map((s) => (
          <li key={s.id}>
            <Card>
              <CardContent className="flex flex-col gap-3 pt-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/communication/${s.key}`} className="font-medium hover:underline">
                    {s.name}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    current {s.status.currentLevel ?? "–"} · target {s.targetLevel} · {s.status.sessionsLast30} sessions in 30 days
                  </span>
                  {s.assessedThisMonth ? <Badge variant="success">Assessed this month</Badge> : null}
                </div>
                <ActionForm action={addAssessmentAction.bind(null, s.id)} submitLabel="Save" submitVariant="outline" inline className="flex-wrap items-center" submitClassName="h-9">
                  <Select name="level" defaultValue={String(s.status.currentLevel ?? 5)} aria-label={`${s.name} level`} className="w-20">
                    {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </Select>
                  <Select name="method" defaultValue="self" aria-label={`${s.name} method`} className="w-44">
                    {ASSESSMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {ASSESSMENT_METHOD_LABELS[m]}
                      </option>
                    ))}
                  </Select>
                  <Input name="evidence" required minLength={3} placeholder="Evidence: what you observed" aria-label={`${s.name} evidence`} className="min-w-48 flex-1" />
                </ActionForm>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
