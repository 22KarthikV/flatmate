"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { parseExpenseId } from "@/features/ledger/form";
import { parsePounds } from "@/features/ledger/money";
import { logger } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { RecurringFormState } from "./constants";
import { isExpectedRecurringError, recurringErrorMessage } from "./errors";

async function signedInClient() {
  const supabase = await createSupabaseServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims.sub) redirect("/sign-in?next=%2Fmoney%2Frecurring");
  return supabase;
}

/**
 * The payer of a variable bill types this month's amount. The database writes the ledger expense,
 * splits it by the template's rule, marks the month created and tells the sharers, once.
 */
export async function enterBillAmount(
  _previous: RecurringFormState,
  formData: FormData,
): Promise<RecurringFormState> {
  const instanceId = parseExpenseId(formData.get("instanceId"));
  if (!instanceId) return { status: "error", message: "We couldn’t find that bill." };

  const amount = parsePounds(String(formData.get("amount") ?? ""));
  if (!amount.ok) return { status: "error", message: amount.message };

  const supabase = await signedInClient();
  const { error } = await supabase.rpc("enter_bill_amount", {
    p_instance: instanceId,
    p_amount_pence: amount.pence,
  });
  if (error) {
    if (!isExpectedRecurringError(error))
      logger.error("recurring.enter_bill_amount_failed", { error });
    return { status: "error", message: recurringErrorMessage(error) };
  }

  revalidatePath("/money");
  revalidatePath("/money/recurring");
  redirect("/money/recurring");
}
