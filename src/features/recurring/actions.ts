"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getMembers } from "@/features/household/members";
import { parseExpenseId } from "@/features/ledger/form";
import { parsePounds } from "@/features/ledger/money";
import { logger } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { RecurringFormState } from "./constants";
import { isExpectedRecurringError, recurringErrorMessage } from "./errors";
import { parseRentPayment, parseSkip, parseTemplate, parseWaiver } from "./schemas";
import { toRpcPayload } from "./template-input";

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

function failure(name: string, error: { message?: string }): RecurringFormState {
  if (!isExpectedRecurringError(error)) logger.error(`recurring.${name}_failed`, { error });
  return { status: "error", message: recurringErrorMessage(error) };
}

/**
 * Creates a rent or bill, or edits one (when a templateId is posted). The form is checked here for
 * friendly messages; the database checks everything again, so nothing here is trusted.
 */
export async function saveTemplate(
  _previous: RecurringFormState,
  formData: FormData,
): Promise<RecurringFormState> {
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("payload") ?? ""));
  } catch {
    return { status: "error", message: "Check the details and try again." };
  }
  const parsed = parseTemplate(raw);
  if (!parsed.ok) return { status: "error", message: parsed.error };

  const members = new Set((await getMembers()).map((member) => member.profileId));
  const named =
    parsed.value.kind === "bill"
      ? [parsed.value.paidBy, ...parsed.value.people.map((p) => p.profileId)]
      : [parsed.value.collectorId, ...parsed.value.rooms.flatMap((room) => room.occupantIds)];
  if (!named.every((id) => members.has(id))) {
    return { status: "error", message: recurringErrorMessage({ message: "not_a_member" }) };
  }

  const templateField = formData.get("templateId");
  const templateId = templateField ? parseExpenseId(templateField) : null;
  if (templateField && !templateId) {
    return { status: "error", message: recurringErrorMessage({ message: "template_not_found" }) };
  }

  let payload: Record<string, unknown>;
  try {
    payload = toRpcPayload(parsed.value);
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Check the rooms.",
    };
  }

  const supabase = await signedInClient();
  const { data: id, error } = await supabase.rpc("save_recurring_template", {
    // null creates a new template; the generated type does not model a null argument.
    p_template_id: templateId as string,
    p_payload: payload as never,
  });
  if (error || typeof id !== "string") return failure("save_template", error ?? {});

  revalidatePath("/money");
  revalidatePath("/money/recurring");
  redirect(`/money/recurring/${id}`);
}

async function change(
  name: "pause_recurring_template" | "resume_recurring_template" | "end_recurring_template",
  formData: FormData,
): Promise<RecurringFormState> {
  const templateId = parseExpenseId(formData.get("templateId"));
  if (!templateId)
    return { status: "error", message: recurringErrorMessage({ message: "template_not_found" }) };

  const supabase = await signedInClient();
  const { error } = await supabase.rpc(name, { p_template_id: templateId });
  if (error) return failure(name, error);

  revalidatePath("/money/recurring");
  revalidatePath(`/money/recurring/${templateId}`);
  redirect(`/money/recurring/${templateId}`);
}

export async function pauseTemplate(
  _previous: RecurringFormState,
  formData: FormData,
): Promise<RecurringFormState> {
  return change("pause_recurring_template", formData);
}

export async function resumeTemplate(
  _previous: RecurringFormState,
  formData: FormData,
): Promise<RecurringFormState> {
  return change("resume_recurring_template", formData);
}

/** Ends a template: it stops creating months but is kept as history. */
export async function endTemplate(
  _previous: RecurringFormState,
  formData: FormData,
): Promise<RecurringFormState> {
  return change("end_recurring_template", formData);
}

/** Skips one upcoming month, which the history then shows as skipped. */
export async function skipMonth(
  _previous: RecurringFormState,
  formData: FormData,
): Promise<RecurringFormState> {
  const parsed = parseSkip({
    templateId: formData.get("templateId"),
    period: formData.get("period"),
  });
  if (!parsed.ok) return { status: "error", message: parsed.error };

  const supabase = await signedInClient();
  const { error } = await supabase.rpc("skip_recurring_month", {
    p_template_id: parsed.value.templateId,
    p_period: parsed.value.period,
  });
  if (error) return failure("skip_recurring_month", error);

  revalidatePath("/money/recurring");
  revalidatePath(`/money/recurring/${parsed.value.templateId}`);
  redirect(`/money/recurring/${parsed.value.templateId}`);
}

/** "I paid my rent". It stays pending until the collector or another admin confirms it. */
export async function recordRentPayment(
  _previous: RecurringFormState,
  formData: FormData,
): Promise<RecurringFormState> {
  const amount = parsePounds(String(formData.get("amount") ?? ""));
  if (!amount.ok) return { status: "error", message: amount.message };
  const parsed = parseRentPayment({ amountPence: amount.pence });
  if (!parsed.ok) return { status: "error", message: parsed.error };

  const supabase = await signedInClient();
  const { error } = await supabase.rpc("record_rent_payment", {
    p_amount_pence: parsed.value.amountPence,
  });
  if (error) return failure("record_rent_payment", error);

  revalidatePath("/money/rent");
  redirect("/money/rent");
}

async function decide(
  name:
    "confirm_rent_payment" | "decline_rent_payment" | "cancel_rent_payment" | "void_rent_payment",
  formData: FormData,
): Promise<RecurringFormState> {
  const paymentId = parseExpenseId(formData.get("paymentId"));
  if (!paymentId) {
    return { status: "error", message: recurringErrorMessage({ message: "payment_not_found" }) };
  }
  const supabase = await signedInClient();
  const { error } = await supabase.rpc(name, { p_payment_id: paymentId });
  if (error) return failure(name, error);

  revalidatePath("/money/rent");
  redirect("/money/rent");
}

export async function confirmRentPayment(
  _previous: RecurringFormState,
  formData: FormData,
): Promise<RecurringFormState> {
  return decide("confirm_rent_payment", formData);
}

export async function declineRentPayment(
  _previous: RecurringFormState,
  formData: FormData,
): Promise<RecurringFormState> {
  return decide("decline_rent_payment", formData);
}

export async function cancelRentPayment(
  _previous: RecurringFormState,
  formData: FormData,
): Promise<RecurringFormState> {
  return decide("cancel_rent_payment", formData);
}

/** An admin reverses a confirmation made by mistake. */
export async function voidRentPayment(
  _previous: RecurringFormState,
  formData: FormData,
): Promise<RecurringFormState> {
  return decide("void_rent_payment", formData);
}

/** An admin closes rent that will not be paid, with a reason that is kept. */
export async function waiveRent(
  _previous: RecurringFormState,
  formData: FormData,
): Promise<RecurringFormState> {
  const amount = parsePounds(String(formData.get("amount") ?? ""));
  if (!amount.ok) return { status: "error", message: amount.message };
  const parsed = parseWaiver({
    payerId: formData.get("payerId"),
    amountPence: amount.pence,
    reason: String(formData.get("reason") ?? ""),
  });
  if (!parsed.ok) return { status: "error", message: parsed.error };

  const supabase = await signedInClient();
  const { error } = await supabase.rpc("waive_rent", {
    p_payer_id: parsed.value.payerId,
    p_amount_pence: parsed.value.amountPence,
    p_reason: parsed.value.reason,
  });
  if (error) return failure("waive_rent", error);

  revalidatePath("/money/rent");
  redirect("/money/rent");
}
