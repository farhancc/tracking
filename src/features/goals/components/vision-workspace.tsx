import { Plus } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GOAL_CATEGORIES, GOAL_CATEGORY_HINTS, GOAL_CATEGORY_LABELS } from "@/lib/domain/goals";
import { loadVisionPage } from "../server/queries";
import { GoalProgress } from "./goal-progress";
import { JourneySetupForm } from "./journey-setup-form";
import { VisionForm } from "./vision-form";

export async function VisionWorkspace() {
  const data = await loadVisionPage();
  if (!data.ready) return <JourneySetupForm defaultStartDate={data.workspace.today} />;
  const { vision, versions, fiveYearGoals, workspace } = data;

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="flex flex-col gap-6 lg:col-span-3">
        <Card>
          <CardHeader>
            <CardTitle>Vision statement</CardTitle>
            <CardDescription>
              {vision
                ? `Version ${vision.version}, effective ${vision.effectiveFrom}. Saving keeps the old version.`
                : "Write the five-year vision every other goal serves."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <VisionForm
              initial={{
                title: vision?.title ?? "Five-year vision",
                statement: vision?.statement ?? "",
                professionalIdentity: vision?.professionalIdentity ?? "",
                exitStrategy: vision?.exitStrategy ?? "",
              }}
            />
          </CardContent>
        </Card>

        {versions.length > 1 ? (
          <Card>
            <CardHeader>
              <CardTitle>Version history</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="flex flex-col gap-3">
                {versions.map((v) => (
                  <li key={v.id} className="rounded-lg border p-3 text-sm">
                    <div className="mb-1 text-xs text-muted-foreground">
                      v{v.version} · {v.effectiveFrom}
                      {v.isCurrent ? " · current" : ""}
                    </div>
                    <p className="line-clamp-3 whitespace-pre-wrap">{v.statement}</p>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        ) : null}
      </div>

      <div className="flex flex-col gap-4 lg:col-span-2">
        <div>
          <h2 className="font-semibold">Measurable five-year goals</h2>
          <p className="text-sm text-muted-foreground">
            Each part of the vision becomes a five-year goal with a success metric and target, measured by outcome.
          </p>
        </div>
        {GOAL_CATEGORIES.filter((c) => c !== "other" || fiveYearGoals.some((g) => g.category === "other")).map((category) => {
          const items = fiveYearGoals.filter((g) => g.category === category);
          return (
            <Card key={category}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{GOAL_CATEGORY_LABELS[category]}</CardTitle>
                {items.length === 0 ? <CardDescription className="text-xs">{GOAL_CATEGORY_HINTS[category]}</CardDescription> : null}
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {items.map((g) => (
                  <div key={g.id} className="flex flex-col gap-1.5">
                    <Link href={`/goals/${g.id}`} className="text-sm font-medium hover:underline">
                      {g.title}
                    </Link>
                    <GoalProgress goal={g} compact />
                  </div>
                ))}
                <Link
                  href={`/goals/new?level=five_year&category=${category}`}
                  className={buttonVariants({ variant: "outline", size: "sm", className: "self-start" })}
                >
                  <Plus aria-hidden /> Add {GOAL_CATEGORY_LABELS[category].toLowerCase()}
                </Link>
              </CardContent>
            </Card>
          );
        })}
        <p className="text-xs text-muted-foreground">Journey: {workspace.journey.startDate} → {workspace.journey.endDate}</p>
      </div>
    </div>
  );
}
