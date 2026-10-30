"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { Json } from "@/lib/db/types";
import { logger } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { AvailabilityFormState, ChoreFormState, GenerateFormState } from "./constants";
import { parseGenerationInput, planWeek } from "./generation";
import { isExpectedRotaError, rotaErrorMessage } from "./errors";
import {
  parseAvailabilityForm,
  parseChoreFields,
  parseChoreId,
  rawChoreFromFormData,
} from "./schemas";

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

/** Saves the signed-in person's seven answers for a week. The database checks the deadline. */
export async function saveAvailability(
  _previous: AvailabilityFormState,
  formData: FormData,
): Promise<AvailabilityFormState> {
  const parsed = parseAvailabilityForm(formData);
  if (!parsed.ok) return { status: "error", message: parsed.message };

  const supabase = await signedInClient();
  const { error } = await supabase.rpc("set_availability", {
    p_week_start: parsed.weekStart,
    p_days: parsed.days,
  });
  if (error) {
    if (!isExpectedRotaError(error)) logger.error("rota.set_availability_failed", { error });
    return { status: "error", message: rotaErrorMessage(error) };
  }

  revalidatePath("/rota/availability");
  return { status: "saved" };
}

async function rotaCall(
  fn: "tick_item" | "untick_item",
  args: { p_item_id: string },
): Promise<void>;
async function rotaCall(
  fn: "complete_assignment" | "reopen_assignment" | "sign_off_assignment",
  args: { p_assignment_id: string },
): Promise<void>;
async function rotaCall(fn: string, args: Record<string, string>): Promise<void> {
  const supabase = await signedInClient();
  const { error } = await supabase.rpc(fn as "tick_item", args as { p_item_id: string });
  if (error && !isExpectedRotaError(error)) logger.error(`rota.${fn}_failed`, { error });
  revalidatePath("/rota", "layout");
}

/** Ticks one step of a chore. Finishing the last step finishes the chore. */
export async function tickItem(formData: FormData): Promise<void> {
  const id = parseChoreId(formData.get("itemId"));
  if (id) await rotaCall("tick_item", { p_item_id: id });
}

export async function untickItem(formData: FormData): Promise<void> {
  const id = parseChoreId(formData.get("itemId"));
  if (id) await rotaCall("untick_item", { p_item_id: id });
}

/** Finishes a chore that has no steps. */
export async function completeAssignment(formData: FormData): Promise<void> {
  const id = parseChoreId(formData.get("assignmentId"));
  if (id) await rotaCall("complete_assignment", { p_assignment_id: id });
}

export async function reopenAssignment(formData: FormData): Promise<void> {
  const id = parseChoreId(formData.get("assignmentId"));
  if (id) await rotaCall("reopen_assignment", { p_assignment_id: id });
}

export async function signOffAssignment(formData: FormData): Promise<void> {
  const id = parseChoreId(formData.get("assignmentId"));
  if (id) await rotaCall("sign_off_assignment", { p_assignment_id: id });
}

/**
 * Builds a week now (an owner or admin). The scheduler runs here, on the flat's real inputs, and the
 * database checks and stores the result. If the week already has a rota this makes a new revision
 * and keeps the old one; otherwise it is the first. People who have not answered yet count as
 * around, so the week is best generated after the deadline.
 */
export async function generateWeekNow(
  _previous: GenerateFormState,
  formData: FormData,
): Promise<GenerateFormState> {
  const weekStart = formData.get("weekStart");
  if (typeof weekStart !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return { status: "error", message: "We couldn’t tell which week that was." };
  }

  const supabase = await signedInClient();
  const { data: input, error: inputError } = await supabase.rpc("rota_generation_input", {
    p_week_start: weekStart,
  });
  if (inputError) {
    if (!isExpectedRotaError(inputError))
      logger.error("rota.generation_input_failed", { error: inputError });
    return { status: "error", message: rotaErrorMessage(inputError) };
  }

  const parsed = parseGenerationInput(input);
  if (parsed.chores.length === 0) {
    return {
      status: "error",
      message: "Add some chores first, then there is something to give out.",
    };
  }
  const plan = planWeek(weekStart, parsed);

  const { data: existing } = await supabase
    .from("rota_weeks")
    .select("id")
    .eq("week_start", weekStart)
    .is("superseded_at", null)
    .maybeSingle();

  const { error } = await supabase.rpc("store_rota_week", {
    p_week_start: weekStart,
    p_assignments: plan.assignments as unknown as Json,
    p_owed: plan.owed as unknown as Json,
    p_reason: existing ? "manual" : "weekly",
  });
  if (error) {
    if (!isExpectedRotaError(error)) logger.error("rota.store_week_failed", { error });
    return { status: "error", message: rotaErrorMessage(error) };
  }

  revalidatePath("/rota");
  const unassigned = plan.assignments.filter((a) => a.assignee === null).length;
  return {
    status: "saved",
    message:
      (existing
        ? "The week was rebuilt and everyone has been told."
        : "The week is ready and everyone has been told.") +
      (unassigned > 0
        ? ` ${unassigned} chore${unassigned === 1 ? "" : "s"} had nobody around.`
        : ""),
  };
}

function chosenId(formData: FormData, key: string): string | null {
  return parseChoreId(formData.get(key));
}

/** Asks a flatmate to take one of your chores, or to exchange it for one of theirs. */
export async function requestSwap(
  _previous: GenerateFormState,
  formData: FormData,
): Promise<GenerateFormState> {
  const assignmentId = chosenId(formData, "assignmentId");
  const toProfile = chosenId(formData, "toProfile");
  if (!assignmentId || !toProfile) return { status: "error", message: "Choose who to ask." };

  const supabase = await signedInClient();
  const { error } = await supabase.rpc("request_swap", {
    p_assignment_id: assignmentId,
    p_to_profile: toProfile,
    p_in_return_id: chosenId(formData, "inReturnId") ?? undefined,
  });
  if (error) {
    if (!isExpectedRotaError(error)) logger.error("rota.request_swap_failed", { error });
    return { status: "error", message: rotaErrorMessage(error) };
  }
  revalidatePath("/rota", "layout");
  return {
    status: "saved",
    message: "Asked. They will be told, and nothing changes until they accept.",
  };
}

/** Accepts or declines a swap that was asked of you. */
export async function decideSwap(formData: FormData): Promise<void> {
  const swapId = chosenId(formData, "swapId");
  if (!swapId) return;
  const supabase = await signedInClient();
  const { error } = await supabase.rpc("decide_swap", {
    p_swap_id: swapId,
    p_accept: formData.get("accept") === "yes",
  });
  if (error && !isExpectedRotaError(error)) logger.error("rota.decide_swap_failed", { error });
  revalidatePath("/rota", "layout");
}

/** Withdraws a swap you asked for. */
export async function cancelSwap(formData: FormData): Promise<void> {
  const swapId = chosenId(formData, "swapId");
  if (!swapId) return;
  const supabase = await signedInClient();
  const { error } = await supabase.rpc("cancel_swap", { p_swap_id: swapId });
  if (error && !isExpectedRotaError(error)) logger.error("rota.cancel_swap_failed", { error });
  revalidatePath("/rota", "layout");
}

/** An owner or admin moves a chore straight to someone else. */
export async function reassignChore(
  _previous: GenerateFormState,
  formData: FormData,
): Promise<GenerateFormState> {
  const assignmentId = chosenId(formData, "assignmentId");
  const toProfile = chosenId(formData, "toProfile");
  if (!assignmentId || !toProfile)
    return { status: "error", message: "Choose who should have it." };

  const supabase = await signedInClient();
  const { error } = await supabase.rpc("reassign_assignment", {
    p_assignment_id: assignmentId,
    p_to_profile: toProfile,
  });
  if (error) {
    if (!isExpectedRotaError(error)) logger.error("rota.reassign_failed", { error });
    return { status: "error", message: rotaErrorMessage(error) };
  }
  revalidatePath("/rota", "layout");
  return { status: "saved", message: "Moved. They have been told." };
}
