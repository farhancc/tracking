"use client";

import { useActionState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form-controls";
import { useFreshState } from "@/components/use-fresh-state";
import { createJourneyAction, type ActionState } from "../server/actions";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function JourneySetupForm({ defaultStartDate }: { defaultStartDate: string }) {
  const [rawState, action, pending] = useActionState<ActionState, FormData>(createJourneyAction, null);
  const state = useFreshState(rawState);
  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", []);
  const errors = state?.fieldErrors ?? {};

  return (
    <Card className="mx-auto max-w-xl">
      <CardHeader>
        <CardTitle>Start your five-year journey</CardTitle>
        <CardDescription>
          The journey is the five-year window every goal sits in. It also creates your four strategic pillars: Sales
          mastery, Product entrepreneurship, Personal branding and Financial independence.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid gap-4 sm:grid-cols-2">
          <Field label="Journey name" htmlFor="name" errors={errors.name} className="sm:col-span-2">
            <Input id="name" name="name" defaultValue="My five-year journey" required />
          </Field>
          <Field label="Day 1" htmlFor="startDate" hint="Ends five years later." errors={errors.startDate}>
            <Input id="startDate" name="startDate" type="date" defaultValue={defaultStartDate} required />
          </Field>
          <Field label="Base currency" htmlFor="baseCurrency" errors={errors.baseCurrency}>
            <Input id="baseCurrency" name="baseCurrency" defaultValue="USD" maxLength={3} required className="uppercase" />
          </Field>
          <Field label="Timezone" htmlFor="timezone" errors={errors.timezone}>
            <Input id="timezone" name="timezone" defaultValue={timezone} required />
          </Field>
          <Field label="Week starts on" htmlFor="weekStartsOn" errors={errors.weekStartsOn}>
            <Select id="weekStartsOn" name="weekStartsOn" defaultValue="1">
              {WEEKDAYS.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </Select>
          </Field>
          {state && !state.ok ? (
            <p role="alert" className="text-sm text-destructive sm:col-span-2">
              {state.message}
            </p>
          ) : null}
          <div className="sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Starting…" : "Start journey"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
