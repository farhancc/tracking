"use client";

import Link from "next/link";
import { useActionState, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { useFreshState } from "@/components/use-fresh-state";
import { maxDate } from "@/lib/domain/dates";
import {
  GOAL_CATEGORIES,
  GOAL_CATEGORY_HINTS,
  GOAL_CATEGORY_LABELS,
  GOAL_LEVEL_LABELS,
  GOAL_LEVELS,
  GOAL_PRIORITIES,
  GOAL_PRIORITY_LABELS,
  GOAL_STATUS_LABELS,
  GOAL_STATUSES,
  MEASURE_UNIT_LABELS,
  MEASURE_UNITS,
  MEASUREMENT_MODE_LABELS,
  MEASUREMENT_MODES,
  isValidParentLevel,
  suggestPeriod,
  type GoalCategory,
  type GoalLevel,
} from "@/lib/domain/goals";
import type { ActionState } from "../server/actions";

export type GoalOption = {
  id: string;
  parentId: string | null;
  title: string;
  level: GoalLevel;
  category: string | null;
  pillarId: string;
  startDate: string;
  targetDate: string;
};

export type GoalFormValues = {
  title: string;
  description: string;
  pillarId: string;
  level: GoalLevel;
  category: string;
  parentId: string;
  startDate: string;
  targetDate: string;
  priority: number;
  status: string;
  successMetric: string;
  unit: string;
  currency: string;
  measurementMode: string;
  baselineValue: string;
  targetValue: string;
  notes: string;
};

function descendantsOf(id: string, options: GoalOption[]): Set<string> {
  const out = new Set<string>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const o of options) {
      if (o.parentId && out.has(o.parentId) && !out.has(o.id)) {
        out.add(o.id);
        grew = true;
      }
    }
  }
  return out;
}

export function GoalForm({
  mode,
  action,
  initial,
  pillars,
  options,
  journey,
  today,
  weekStartsOn,
  goalId,
  cancelHref,
}: {
  mode: "create" | "edit";
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  initial: GoalFormValues;
  pillars: { id: string; name: string; color: string }[];
  options: GoalOption[];
  journey: { startDate: string; endDate: string };
  today: string;
  weekStartsOn: number;
  goalId?: string;
  cancelHref: string;
}) {
  const [rawState, formAction, pending] = useActionState(action, null);
  const state = useFreshState(rawState);
  const errors = state?.fieldErrors ?? {};
  const formRef = useRef<HTMLFormElement>(null);
  const submitted = useRef(false);

  const [level, setLevel] = useState<GoalLevel>(initial.level);
  const [parentId, setParentId] = useState(initial.parentId);
  const [pillarId, setPillarId] = useState(initial.pillarId);
  const [unit, setUnit] = useState(initial.unit);
  const [startDate, setStartDate] = useState(initial.startDate);
  const [targetDate, setTargetDate] = useState(initial.targetDate);
  const [datesTouched, setDatesTouched] = useState(mode === "edit");
  const [pillarTouched, setPillarTouched] = useState(mode === "edit");

  const excluded = useMemo(() => (goalId ? descendantsOf(goalId, options) : new Set<string>()), [goalId, options]);
  const parentChoices = useMemo(
    () => options.filter((o) => !excluded.has(o.id) && isValidParentLevel(o.level, level)),
    [options, excluded, level],
  );
  const parent = options.find((o) => o.id === parentId);

  function resuggest(nextLevel: GoalLevel, nextParentId: string) {
    if (datesTouched) return;
    const p = options.find((o) => o.id === nextParentId);
    const bounds = p
      ? { startDate: p.startDate, targetDate: p.targetDate }
      : { startDate: journey.startDate, targetDate: journey.endDate };
    const anchor = nextLevel === "five_year" ? journey.startDate : maxDate(today, bounds.startDate);
    const period = suggestPeriod(nextLevel, anchor, bounds, weekStartsOn);
    setStartDate(period.startDate);
    setTargetDate(period.targetDate);
  }

  function onLevelChange(next: GoalLevel) {
    setLevel(next);
    let nextParent = parentId;
    const current = options.find((o) => o.id === parentId);
    if (next === "five_year" || (current && !isValidParentLevel(current.level, next))) nextParent = "";
    setParentId(nextParent);
    resuggest(next, nextParent);
  }

  function onParentChange(next: string) {
    setParentId(next);
    const p = options.find((o) => o.id === next);
    if (p && !pillarTouched) setPillarId(p.pillarId);
    resuggest(level, next);
  }

  // After a successful create the action redirects to the new goal. Next.js keeps
  // this page mounted but hidden, so start the next visit with a clean form.
  useLayoutEffect(() => {
    const form = formRef.current;
    return () => {
      if (mode !== "create" || !submitted.current) return;
      submitted.current = false;
      form?.reset();
      setLevel(initial.level);
      setParentId(initial.parentId);
      setPillarId(initial.pillarId);
      setUnit(initial.unit);
      setStartDate(initial.startDate);
      setTargetDate(initial.targetDate);
      setDatesTouched(false);
      setPillarTouched(false);
    };
  }, [mode, initial]);

  const isFiveYear = level === "five_year";

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={() => {
        submitted.current = true;
      }}
      className="flex flex-col gap-6"
    >
      <Card>
        <CardHeader>
          <CardTitle>Goal</CardTitle>
          <CardDescription>Where it sits in the hierarchy and which pillar it serves.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Level" htmlFor="level" errors={errors.level}>
            <Select id="level" name="level" value={level} onChange={(e) => onLevelChange(e.target.value as GoalLevel)}>
              {GOAL_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {GOAL_LEVEL_LABELS[l]}
                </option>
              ))}
            </Select>
          </Field>
          {isFiveYear ? (
            <input type="hidden" name="parentId" value="" />
          ) : (
            <Field
              label="Parent goal"
              htmlFor="parentId"
              hint={parentChoices.length === 0 ? "No goal at a higher level yet. Create a five-year goal first." : undefined}
              errors={errors.parentId}
            >
              <Select id="parentId" name="parentId" value={parentId} onChange={(e) => onParentChange(e.target.value)}>
                <option value="">No parent (unaligned)</option>
                {parentChoices.map((o) => (
                  <option key={o.id} value={o.id}>
                    {GOAL_LEVEL_LABELS[o.level]}: {o.title}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field
            label={isFiveYear ? "Vision category" : "Vision category (optional)"}
            htmlFor="category"
            hint={
              isFiveYear
                ? GOAL_CATEGORY_HINTS[(initial.category || "financial") as GoalCategory]
                : parent
                  ? "Leave empty to inherit from the parent."
                  : undefined
            }
            errors={errors.category}
          >
            <Select id="category" name="category" defaultValue={initial.category} required={isFiveYear}>
              {isFiveYear ? null : <option value="">{parent ? "Inherit from parent" : "None"}</option>}
              {GOAL_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {GOAL_CATEGORY_LABELS[c]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Strategic pillar" htmlFor="pillarId" errors={errors.pillarId}>
            <Select
              id="pillarId"
              name="pillarId"
              value={pillarId}
              onChange={(e) => {
                setPillarId(e.target.value);
                setPillarTouched(true);
              }}
              required
            >
              {pillars.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Title" htmlFor="title" errors={errors.title} className="sm:col-span-2">
            <Input id="title" name="title" defaultValue={initial.title} required maxLength={200} />
          </Field>
          <Field label="Description" htmlFor="description" errors={errors.description} className="sm:col-span-2">
            <Textarea id="description" name="description" defaultValue={initial.description} rows={3} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Outcome</CardTitle>
          <CardDescription>
            Success is the metric moving from baseline to target. The current value comes only from the measurements you
            log. Completed tasks or sub-goals never count as achievement.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Success metric"
            htmlFor="successMetric"
            hint="What you will measure, e.g. Net worth, Paying customers, Followers, Dials made"
            errors={errors.successMetric}
            className="sm:col-span-2"
          >
            <Input id="successMetric" name="successMetric" defaultValue={initial.successMetric} required maxLength={200} />
          </Field>
          <Field label="Unit" htmlFor="unit" errors={errors.unit}>
            <Select id="unit" name="unit" value={unit} onChange={(e) => setUnit(e.target.value)}>
              {MEASURE_UNITS.map((u) => (
                <option key={u} value={u}>
                  {MEASURE_UNIT_LABELS[u]}
                </option>
              ))}
            </Select>
          </Field>
          {unit === "currency" ? (
            <Field label="Currency" htmlFor="currency" errors={errors.currency}>
              <Input id="currency" name="currency" defaultValue={initial.currency} maxLength={3} required className="uppercase" />
            </Field>
          ) : (
            <input type="hidden" name="currency" value="" />
          )}
          <Field label="How measurements combine" htmlFor="measurementMode" errors={errors.measurementMode} className="sm:col-span-2">
            <Select id="measurementMode" name="measurementMode" defaultValue={unit === "boolean" ? "latest" : initial.measurementMode}>
              {MEASUREMENT_MODES.filter((m) => unit !== "boolean" || m === "latest").map((m) => (
                <option key={m} value={m}>
                  {MEASUREMENT_MODE_LABELS[m]}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Baseline (starting value)"
            htmlFor="baselineValue"
            hint={unit === "boolean" ? "0 = no, 1 = yes" : "For reduction goals (e.g. debt), the baseline is higher than the target."}
            errors={errors.baselineValue}
          >
            <Input id="baselineValue" name="baselineValue" type="number" step="any" defaultValue={initial.baselineValue} required />
          </Field>
          <Field label="Target value" htmlFor="targetValue" errors={errors.targetValue}>
            <Input id="targetValue" name="targetValue" type="number" step="any" defaultValue={initial.targetValue} required />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Timing and priority</CardTitle>
          <CardDescription>
            {parent
              ? `Must fall within the parent's period (${parent.startDate} to ${parent.targetDate}).`
              : `Must fall within your journey (${journey.startDate} to ${journey.endDate}).`}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Start date" htmlFor="startDate" errors={errors.startDate}>
            <Input
              id="startDate"
              name="startDate"
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setDatesTouched(true);
              }}
              required
            />
          </Field>
          <Field label="Target date" htmlFor="targetDate" errors={errors.targetDate}>
            <Input
              id="targetDate"
              name="targetDate"
              type="date"
              value={targetDate}
              onChange={(e) => {
                setTargetDate(e.target.value);
                setDatesTouched(true);
              }}
              required
            />
          </Field>
          <Field label="Priority" htmlFor="priority" errors={errors.priority}>
            <Select id="priority" name="priority" defaultValue={String(initial.priority)}>
              {GOAL_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {GOAL_PRIORITY_LABELS[p]}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Status"
            htmlFor="status"
            hint="Achieved is accepted only when the success metric has reached the target."
            errors={errors.status}
          >
            <Select id="status" name="status" defaultValue={initial.status}>
              {GOAL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {GOAL_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Notes" htmlFor="notes" errors={errors.notes} className="sm:col-span-2">
            <Textarea id="notes" name="notes" defaultValue={initial.notes} rows={4} />
          </Field>
        </CardContent>
      </Card>

      {state && !state.ok ? (
        <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {state.message}
        </div>
      ) : null}

      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : mode === "create" ? "Create goal" : "Save changes"}
        </Button>
        <Link href={cancelHref} className={buttonVariants({ variant: "outline" })}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
