"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getMembers } from "@/features/household/members";
import { logger } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { ExpenseFormState } from "./constants";
import { expenseErrorMessage, isExpectedExpenseError } from "./errors";
import { londonToday, parseExpenseFields, parseExpenseId, rawFromFormData } from "./form";

type Parsed = Extract<ReturnType<typeof parseExpenseFields>, { ok: true }>["value"];

/** Checks the posted form against the people currently in the flat. */
async function readExpense(
  formData: FormData,
): Promise<{ ok: true; value: Parsed } | { ok: false; message: string }> {
  const members = await getMembers();
  return parseExpenseFields(
    rawFromFormData(formData),
    members.map((member) => member.profileId),
    londonToday(),
  );
}

async function signedInClient() {
  const supabase = await createSupabaseServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims.sub) redirect("/sign-in?next=%2Fmoney");
  return supabase;
}

function rpcArguments(value: Parsed) {
  return {
    p_amount_pence: value.amountPence,
    p_description: value.description,
    p_category: value.category,
    p_occurred_on: value.occurredOn,
    p_paid_by: value.paidBy,
    p_profile_ids: value.profileIds,
    p_share_pence: value.sharePence,
  };
}

/**
 * Adds a shared expense. The form is checked here for friendly messages; the database function
 * checks everything again (who is in the flat, that the shares add up) and tells the people it
 * involves in the same transaction.
 */
export async function addExpense(
  _previous: ExpenseFormState,
  formData: FormData,
): Promise<ExpenseFormState> {
  const parsed = await readExpense(formData);
  if (!parsed.ok) return { status: "error", message: parsed.message };

  const supabase = await signedInClient();
  const { data: id, error } = await supabase.rpc("add_expense", rpcArguments(parsed.value));
  if (error || typeof id !== "string") {
    if (!isExpectedExpenseError(error)) logger.error("ledger.add_expense_failed", { error });
    return { status: "error", message: expenseErrorMessage(error) };
  }

  revalidatePath("/money");
  redirect(`/money/expenses/${id}`);
}

/** Corrects an expense: the old one is voided and a replacement added, and its people are told. */
export async function editExpense(
  _previous: ExpenseFormState,
  formData: FormData,
): Promise<ExpenseFormState> {
  const expenseId = parseExpenseId(formData.get("expenseId"));
  if (!expenseId) return { status: "error", message: "We couldn’t find that expense." };

  const parsed = await readExpense(formData);
  if (!parsed.ok) return { status: "error", message: parsed.message };

  const supabase = await signedInClient();
  const { data: id, error } = await supabase.rpc("edit_expense", {
    p_expense_id: expenseId,
    ...rpcArguments(parsed.value),
  });
  if (error || typeof id !== "string") {
    if (!isExpectedExpenseError(error)) logger.error("ledger.edit_expense_failed", { error });
    return { status: "error", message: expenseErrorMessage(error) };
  }

  revalidatePath("/money");
  redirect(`/money/expenses/${id}`);
}

/** Cancels an expense. It stays visible as history and stops counting. */
export async function voidExpense(
  _previous: ExpenseFormState,
  formData: FormData,
): Promise<ExpenseFormState> {
  const expenseId = parseExpenseId(formData.get("expenseId"));
  if (!expenseId) return { status: "error", message: "We couldn’t find that expense." };

  const supabase = await signedInClient();
  const { error } = await supabase.rpc("void_expense", { p_expense_id: expenseId });
  if (error) {
    if (!isExpectedExpenseError(error)) logger.error("ledger.void_expense_failed", { error });
    return { status: "error", message: expenseErrorMessage(error) };
  }

  revalidatePath("/money");
  redirect("/money");
}
