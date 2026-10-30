"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { logger } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { ChoreFormState } from "./constants";
import { isExpectedRotaError, rotaErrorMessage } from "./errors";
import { parseChoreFields, parseChoreId, rawChoreFromFormData } from "./schemas";

async function signedInClient() {
  const supabase = await createSupabaseServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims.sub) redirect("/sign-in?next=%2Frota%2Fchores");
  return supabase;
}

/**
 * Adds a chore, or changes one when the form carries its id. The form is checked here for friendly
 * messages; the database function checks everything again and is the real enforcement.
 */
export async function saveChore(
  _previous: ChoreFormState,
  formData: FormData,
): Promise<ChoreFormState> {
  const parsed = parseChoreFields(rawChoreFromFormData(formData));
  if (!parsed.ok) return { status: "error", message: parsed.message };
  const { value } = parsed;

  const supabase = await signedInClient();
  const { error } = await supabase.rpc("save_chore", {
    p_chore_id: parseChoreId(formData.get("choreId")) ?? undefined,
    p_name: value.name,
    p_cadence: value.cadence,
    p_preferred_dow: value.preferredDow ?? undefined,
    p_every_n_days: value.everyNDays ?? undefined,
    p_effort: value.effort,
    p_needs_signoff: value.needsSignoff,
    p_items: value.items,
  });
  if (error) {
    if (!isExpectedRotaError(error)) logger.error("rota.save_chore_failed", { error });
    return { status: "error", message: rotaErrorMessage(error) };
  }

  revalidatePath("/rota/chores");
  return { status: "saved" };
}

/** Stops a chore being scheduled. Its history stays. */
export async function archiveChore(formData: FormData): Promise<void> {
  const choreId = parseChoreId(formData.get("choreId"));
  if (!choreId) return;
  const supabase = await signedInClient();
  const { error } = await supabase.rpc("archive_chore", { p_chore_id: choreId });
  if (error && !isExpectedRotaError(error)) logger.error("rota.archive_chore_failed", { error });
  revalidatePath("/rota/chores");
}

/** Loads the first flat's five chores into a flat that has none. */
export async function loadDefaultChores(): Promise<void> {
  const supabase = await signedInClient();
  const { error } = await supabase.rpc("load_default_chores");
  if (error && !isExpectedRotaError(error)) logger.error("rota.load_defaults_failed", { error });
  revalidatePath("/rota/chores");
}
