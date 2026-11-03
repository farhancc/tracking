"use server";

import type { Tx } from "@/db/client";
import { formObject, runAction, runSimpleAction, type ActionState } from "@/lib/server-action";
import { accountSchema, balanceSchema, expenseSchema, forecastSchema, incomeSchema, settingsSchema } from "../schemas";
import * as service from "./service";

const run = (fn: (tx: Tx) => Promise<unknown>, success?: string) => runAction(fn, { success });

export async function addIncomeAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return run((tx) => service.addIncome(tx, incomeSchema.parse(formObject(fd))), "Income recorded.");
}
export async function addExpenseAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const raw = formObject(fd);
  // The checkbox can't express "use the category default", so the form sends essential=yes|no explicitly.
  return run((tx) => service.addExpense(tx, expenseSchema.parse(raw)), "Expense recorded.");
}
export async function deleteIncomeAction(id: string): Promise<void> {
  await runSimpleAction((tx) => service.deleteIncome(tx, id));
}
export async function deleteExpenseAction(id: string): Promise<void> {
  await runSimpleAction((tx) => service.deleteExpense(tx, id));
}
export async function createAccountAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return run((tx) => service.createAccount(tx, accountSchema.parse(formObject(fd))), "Account added.");
}
export async function archiveAccountAction(id: string): Promise<void> {
  await runSimpleAction((tx) => service.archiveAccount(tx, id));
}
export async function recordBalanceAction(accountId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run((tx) => service.recordBalance(tx, accountId, balanceSchema.parse(formObject(fd))));
}
export async function addForecastAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return run((tx) => service.addForecast(tx, forecastSchema.parse(formObject(fd))), "Forecast added.");
}
export async function deleteForecastAction(id: string): Promise<void> {
  await runSimpleAction((tx) => service.deleteForecast(tx, id));
}
export async function saveSettingsAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return run((tx) => service.updateSettings(tx, settingsSchema.parse(formObject(fd, "null"))), "Assumptions saved.");
}
