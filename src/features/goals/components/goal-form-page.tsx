import { notFound } from "next/navigation";
import { maxDate } from "@/lib/domain/dates";
import { GOAL_CATEGORIES, GOAL_LEVELS, suggestPeriod, type GoalCategory, type GoalLevel } from "@/lib/domain/goals";
import { createGoalAction, updateGoalAction } from "../server/actions";
import { loadGoalFormData } from "../server/queries";
import { GoalForm, type GoalFormValues } from "./goal-form";
import { JourneySetupForm } from "./journey-setup-form";

type SearchParams = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export async function NewGoalPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [data, params] = await Promise.all([loadGoalFormData(), searchParams]);
  if (!data.ready) return <JourneySetupForm defaultStartDate={data.workspace.today} />;
  const { workspace, options } = data;

  const parent = options.find((o) => o.id === one(params.parentId));
  const requestedLevel = one(params.level);
  const level: GoalLevel =
    requestedLevel && (GOAL_LEVELS as readonly string[]).includes(requestedLevel)
      ? (requestedLevel as GoalLevel)
      : parent
        ? (GOAL_LEVELS[GOAL_LEVELS.indexOf(parent.level as GoalLevel) + 1] ?? "daily")
        : "five_year";
  const requestedCategory = one(params.category);
  const category =
    requestedCategory && (GOAL_CATEGORIES as readonly string[]).includes(requestedCategory)
      ? (requestedCategory as GoalCategory)
      : level === "five_year"
        ? "financial"
        : "";

  const bounds = parent
    ? { startDate: parent.startDate, targetDate: parent.targetDate }
    : { startDate: workspace.journey.startDate, targetDate: workspace.journey.endDate };
  const anchor = level === "five_year" ? workspace.journey.startDate : maxDate(workspace.today, bounds.startDate);
  const period = suggestPeriod(level, anchor, bounds, workspace.weekStartsOn);
  const defaultPillar =
    parent?.pillarId ??
    workspace.pillars.find((p) => p.key === (category === "financial" ? "wealth" : category === "personal_brand" ? "brand" : category === "business_ownership" ? "product" : "sales"))?.id ??
    workspace.pillars[0]?.id ??
    "";

  const initial: GoalFormValues = {
    title: "",
    description: "",
    pillarId: defaultPillar,
    level,
    category,
    parentId: parent?.id ?? "",
    startDate: period.startDate,
    targetDate: period.targetDate,
    priority: 3,
    status: "not_started",
    successMetric: "",
    unit: category === "financial" ? "currency" : category === "exit_condition" ? "boolean" : "number",
    currency: workspace.baseCurrency,
    measurementMode: "latest",
    baselineValue: "0",
    targetValue: category === "exit_condition" ? "1" : "",
    notes: "",
  };

  return (
    <GoalForm
      mode="create"
      action={createGoalAction}
      initial={initial}
      pillars={workspace.pillars}
      options={options}
      journey={workspace.journey}
      today={workspace.today}
      weekStartsOn={workspace.weekStartsOn}
      cancelHref={parent ? `/goals/${parent.id}` : "/goals"}
    />
  );
}

export async function EditGoalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await loadGoalFormData(id).catch((e: { status?: number }) => {
    if (e?.status === 404) notFound();
    throw e;
  });
  if (!data.ready || !data.goal) notFound();
  const { workspace, options, goal } = data;

  const initial: GoalFormValues = {
    title: goal.title,
    description: goal.description ?? "",
    pillarId: goal.pillarId,
    level: goal.level as GoalLevel,
    category: goal.category ?? "",
    parentId: goal.parentId ?? "",
    startDate: goal.startDate,
    targetDate: goal.targetDate,
    priority: goal.priority,
    status: goal.status,
    successMetric: goal.successMetric,
    unit: goal.unit,
    currency: goal.currency ?? workspace.baseCurrency,
    measurementMode: goal.measurementMode,
    baselineValue: String(goal.baselineValue),
    targetValue: String(goal.targetValue),
    notes: goal.notes ?? "",
  };

  return (
    <GoalForm
      mode="edit"
      action={updateGoalAction.bind(null, goal.id)}
      initial={initial}
      pillars={workspace.pillars}
      options={options}
      journey={workspace.journey}
      today={workspace.today}
      weekStartsOn={workspace.weekStartsOn}
      goalId={goal.id}
      cancelHref={`/goals/${goal.id}`}
    />
  );
}
