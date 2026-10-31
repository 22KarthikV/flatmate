"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getMembers } from "@/features/household/members";
import type { ExpenseFormState } from "@/features/ledger/constants";
import { londonToday, parseExpenseFields, rawFromFormData } from "@/features/ledger/form";
import { logger } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { ShoppingFormState } from "./constants";
import { isExpectedShoppingError, shoppingErrorMessage } from "./errors";
import { parseItemFields, parseItemId, parseItemIds } from "./schemas";

async function signedInClient() {
  const supabase = await createSupabaseServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims.sub) redirect("/sign-in?next=%2Fmore%2Fshopping");
  return supabase;
}

/** Adds one thing to the flat's list. The form is checked here for friendly messages; the database checks again. */
export async function addItem(
  _previous: ShoppingFormState,
  formData: FormData,
): Promise<ShoppingFormState> {
  const parsed = parseItemFields(formData.get("name"), formData.get("note"));
  if (!parsed.ok) return { status: "error", message: parsed.message };

  const supabase = await signedInClient();
  const { error } = await supabase.rpc("add_shopping_item", {
    p_name: parsed.value.name,
    p_note: parsed.value.note ?? undefined,
  });
  if (error) {
    if (!isExpectedShoppingError(error)) logger.error("shopping.add_item_failed", { error });
    return { status: "error", message: shoppingErrorMessage(error) };
  }
  revalidatePath("/more/shopping");
  return { status: "saved" };
}

/** Ticks or un-ticks an item. */
export async function setBought(formData: FormData): Promise<void> {
  const itemId = parseItemId(formData.get("itemId"));
  if (!itemId) return;
  const supabase = await signedInClient();
  const { error } = await supabase.rpc("set_shopping_bought", {
    p_item: itemId,
    p_bought: formData.get("bought") === "true",
  });
  if (error && !isExpectedShoppingError(error)) {
    logger.error("shopping.set_bought_failed", { error });
  }
  revalidatePath("/more/shopping");
}

export async function removeItem(formData: FormData): Promise<void> {
  const itemId = parseItemId(formData.get("itemId"));
  if (!itemId) return;
  const supabase = await signedInClient();
  const { error } = await supabase.rpc("remove_shopping_item", { p_item: itemId });
  if (error && !isExpectedShoppingError(error)) {
    logger.error("shopping.remove_item_failed", { error });
  }
  revalidatePath("/more/shopping");
}

export async function clearBought(): Promise<void> {
  const supabase = await signedInClient();
  const { error } = await supabase.rpc("clear_bought_items");
  if (error) logger.error("shopping.clear_failed", { error });
  revalidatePath("/more/shopping");
}

/**
 * Turns bought items into one ordinary expense. The split is read with the ledger's own code; the
 * database function writes the expense through the ledger's writer and checks everything again.
 */
export async function buyItems(
  _previous: ExpenseFormState,
  formData: FormData,
): Promise<ExpenseFormState> {
  const itemIds = parseItemIds(formData.get("itemIds"));
  if (itemIds.length === 0) {
    return { status: "error", message: shoppingErrorMessage({ message: "invalid_items" }) };
  }

  const members = await getMembers();
  const parsed = parseExpenseFields(
    rawFromFormData(formData),
    members.map((member) => member.profileId),
    londonToday(),
  );
  if (!parsed.ok) return { status: "error", message: parsed.message };
  const value = parsed.value;

  const supabase = await signedInClient();
  const { data: id, error } = await supabase.rpc("shopping_to_expense", {
    p_item_ids: itemIds,
    p_amount_pence: value.amountPence,
    p_description: value.description,
    p_category: value.category,
    p_occurred_on: value.occurredOn,
    p_paid_by: value.paidBy,
    p_profile_ids: value.profileIds,
    p_share_pence: value.sharePence,
  });
  if (error || typeof id !== "string") {
    if (!isExpectedShoppingError(error)) logger.error("shopping.to_expense_failed", { error });
    return { status: "error", message: shoppingErrorMessage(error) };
  }

  revalidatePath("/more/shopping");
  revalidatePath("/money");
  redirect(`/money/expenses/${id}`);
}
