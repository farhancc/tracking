import { notFound } from "next/navigation";
import { maxDate } from "@/lib/domain/dates";
import { isIsoDate } from "@/lib/domain/dates";
import {
  GOAL_CATEGORIES,
  GOAL_LEVELS,
  MEASUREMENT_MODES,
  suggestPeriod,
  type GoalCategory,
  type GoalLevel,
  type MeasurementMode,
} from "@/lib/domain/goals";
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
  const suggested = suggestPeriod(level, anchor, bounds, workspace.weekStartsOn);
  // The roadmap links here with explicit dates (e.g. a quarter's start and end).
  const start = one(params.start);
  const end = one(params.end);
  const period =
    start && end && isIsoDate(start) && isIsoDate(end) && start <= end ? { startDate: start, targetDate: end } : suggested;
  const requestedMode = one(params.mode);
  const mode: MeasurementMode =
    requestedMode && (MEASUREMENT_MODES as readonly string[]).includes(requestedMode) ? (requestedMode as MeasurementMode) : "latest";
  const isKeyResult = one(params.kr) === "1" && Boolean(parent);
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
    isKeyResult,
    focusArea: "",
    startDate: period.startDate,
    targetDate: period.targetDate,
    priority: 3,
    status: "not_started",
    successMetric: mode === "key_results" ? "Key results achieved" : "",
    unit: mode === "key_results" ? "percent" : category === "financial" ? "currency" : category === "exit_condition" ? "boolean" : "number",
    currency: workspace.baseCurrency,
    measurementMode: isKeyResult && mode === "key_results" ? "latest" : mode,
    baselineValue: "0",
    targetValue: mode === "key_results" ? "100" : category === "exit_condition" ? "1" : "",
    estimatedHours: "",
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
    isKeyResult: goal.isKeyResult,
    focusArea: goal.focusArea ?? "",
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
    estimatedHours: goal.estimatedHours === null ? "" : String(goal.estimatedHours),
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
