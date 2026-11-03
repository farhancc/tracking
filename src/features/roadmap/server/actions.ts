"use server";

import type { Tx } from "@/db/client";
import {
  formCheckbox,
  formNullable,
  formNullableNumber,
  formNumber,
  formText,
  runAction,
  runSimpleAction,
  type ActionState,
} from "@/lib/server-action";
import {
  deliverableCreateSchema,
  deliverableUpdateSchema,
  kpiCreateSchema,
  kpiUpdateSchema,
  quarterDependencyCreateSchema,
  quarterDependencyUpdateSchema,
  quarterUpdateSchema,
  riskCreateSchema,
  riskUpdateSchema,
  roadmapSettingsSchema,
  yearUpdateSchema,
} from "../schemas";
import * as service from "./service";

const run = (fn: (tx: Tx) => Promise<unknown>, success?: string) => runAction(fn, { success });
const simple = (fn: (tx: Tx) => Promise<unknown>) => runSimpleAction(fn);

export async function generateRoadmapAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async (tx) => {
    const hours = formNumber(fd, "weeklyCapacityHours");
    if (hours !== undefined) {
      await service.updateRoadmapSettings(tx, roadmapSettingsSchema.parse({ weeklyCapacityHours: hours, applyToFutureQuarters: true }));
    }
    await service.generateRoadmap(tx);
  }, "Roadmap generated: 5 annual plans and 20 quarters.");
}

export async function saveRoadmapSettingsAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async (tx) => {
    await service.updateRoadmapSettings(
      tx,
      roadmapSettingsSchema.parse({
        weeklyCapacityHours: formNumber(fd, "weeklyCapacityHours"),
        applyToFutureQuarters: formCheckbox(fd, "applyToFutureQuarters"),
      }),
    );
  }, "Available time saved.");
}

export async function updateYearAction(yearNumber: number, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async (tx) => {
    await service.updateYear(
      tx,
      yearNumber,
      yearUpdateSchema.parse({
        theme: formText(fd, "theme"),
        direction: formText(fd, "direction"),
        isProvisional: !formCheckbox(fd, "confirmed"),
        notes: formNullable(fd, "notes"),
      }),
    );
  }, "Year plan saved.");
}

export async function updateQuarterAction(quarterNumber: number, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async (tx) => {
    await service.updateQuarter(
      tx,
      quarterNumber,
      quarterUpdateSchema.parse({
        focus: formNullable(fd, "focus"),
        capacityHoursPerWeek: formNullableNumber(fd, "capacityHoursPerWeek"),
        midReviewOn: formNullable(fd, "midReviewOn"),
        reviewOn: formNullable(fd, "reviewOn"),
      }),
    );
  }, "Quarter saved.");
}

export async function saveQuarterReviewAction(quarterNumber: number, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async (tx) => {
    await service.updateQuarter(
      tx,
      quarterNumber,
      quarterUpdateSchema.parse({ reviewSummary: formNullable(fd, "reviewSummary"), reviewed: formCheckbox(fd, "reviewed") }),
    );
  }, "Review saved.");
}

// --- Deliverables -----------------------------------------------------------

export async function addDeliverableAction(quarterNumber: number, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async (tx) => {
    await service.addDeliverable(
      tx,
      quarterNumber,
      deliverableCreateSchema.parse({
        title: formText(fd, "title"),
        goalId: formNullable(fd, "goalId"),
        dueOn: formNullable(fd, "dueOn"),
        estimatedHours: formNullableNumber(fd, "estimatedHours"),
      }),
    );
  }, "Deliverable added.");
}

export async function setDeliverableStatusAction(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async (tx) => {
    await service.updateDeliverable(
      tx,
      id,
      deliverableUpdateSchema.parse({ status: formText(fd, "status"), evidence: formNullable(fd, "evidence") }),
    );
  });
}

export async function deleteDeliverableAction(id: string): Promise<void> {
  await simple((tx) => service.deleteDeliverable(tx, id));
}

// --- KPIs -------------------------------------------------------------------

export async function addKpiAction(quarterNumber: number, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async (tx) => {
    await service.addKpi(
      tx,
      quarterNumber,
      kpiCreateSchema.parse({
        name: formText(fd, "name"),
        unit: formText(fd, "unit"),
        currency: formNullable(fd, "currency"),
        direction: formText(fd, "direction"),
        targetValue: formNumber(fd, "targetValue"),
        actualValue: formNullableNumber(fd, "actualValue"),
      }),
    );
  }, "KPI added.");
}

export async function updateKpiActualAction(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async (tx) => {
    await service.updateKpi(tx, id, kpiUpdateSchema.parse({ actualValue: formNullableNumber(fd, "actualValue") }));
  });
}

export async function deleteKpiAction(id: string): Promise<void> {
  await simple((tx) => service.deleteKpi(tx, id));
}

// --- Risks ------------------------------------------------------------------

export async function addRiskAction(quarterNumber: number, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async (tx) => {
    await service.addRisk(
      tx,
      quarterNumber,
      riskCreateSchema.parse({
        title: formText(fd, "title"),
        likelihood: formNumber(fd, "likelihood"),
        impact: formNumber(fd, "impact"),
        mitigation: formNullable(fd, "mitigation"),
      }),
    );
  }, "Risk added.");
}

export async function setRiskStatusAction(id: string, status: string): Promise<void> {
  await simple((tx) => service.updateRisk(tx, id, riskUpdateSchema.parse({ status })));
}

export async function deleteRiskAction(id: string): Promise<void> {
  await simple((tx) => service.deleteRisk(tx, id));
}

// --- Dependencies -----------------------------------------------------------

export async function addQuarterDependencyAction(quarterNumber: number, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async (tx) => {
    await service.addQuarterDependency(
      tx,
      quarterNumber,
      quarterDependencyCreateSchema.parse({
        description: formText(fd, "description"),
        dependsOnGoalId: formNullable(fd, "dependsOnGoalId"),
        neededBy: formNullable(fd, "neededBy"),
      }),
    );
  }, "Dependency added.");
}

export async function setQuarterDependencyStatusAction(id: string, status: string): Promise<void> {
  await simple((tx) => service.updateQuarterDependency(tx, id, quarterDependencyUpdateSchema.parse({ status })));
}

export async function deleteQuarterDependencyAction(id: string): Promise<void> {
  await simple((tx) => service.deleteQuarterDependency(tx, id));
}
