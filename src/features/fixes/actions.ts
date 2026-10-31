"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { logger } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { STATUSES, STATUS_NOTE_MAX, type FixFormState } from "./constants";
import { fixErrorMessage, isExpectedFixError } from "./errors";
import { parseFixFields, parseFixId, parseNote } from "./schemas";

async function signedInClient() {
  const supabase = await createSupabaseServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims.sub) redirect("/sign-in?next=%2Fmore%2Ffixes");
  return supabase;
}

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

function refresh(id?: string) {
  revalidatePath("/more/fixes");
  if (id) revalidatePath(`/more/fixes/${id}`);
}

/** Reports a problem and opens it. The database checks everything again. */
export async function reportFix(
  _previous: FixFormState,
  formData: FormData,
): Promise<FixFormState> {
  const parsed = parseFixFields({
    title: text(formData, "title"),
    details: text(formData, "details"),
    location: text(formData, "location"),
  });
  if (!parsed.ok) return { status: "error", message: parsed.message };

  const supabase = await signedInClient();
  const { data: id, error } = await supabase.rpc("report_fix", {
    p_title: parsed.value.title,
    p_details: parsed.value.details ?? undefined,
    p_location: parsed.value.location ?? undefined,
  });
  if (error || typeof id !== "string") {
    if (!isExpectedFixError(error)) logger.error("fixes.report_failed", { error });
    return { status: "error", message: fixErrorMessage(error) };
  }
  refresh();
  redirect(`/more/fixes/${id}`);
}

export async function addNote(_previous: FixFormState, formData: FormData): Promise<FixFormState> {
  const id = parseFixId(formData.get("reportId"));
  if (!id) return { status: "error", message: fixErrorMessage({ message: "report_not_found" }) };
  const note = parseNote(text(formData, "body"));
  if (!note.ok) return { status: "error", message: note.message };

  const supabase = await signedInClient();
  const { error } = await supabase.rpc("add_fix_note", { p_report: id, p_body: note.value });
  if (error) {
    if (!isExpectedFixError(error)) logger.error("fixes.note_failed", { error });
    return { status: "error", message: fixErrorMessage(error) };
  }
  refresh(id);
  return { status: "saved" };
}

export async function changeStatus(
  _previous: FixFormState,
  formData: FormData,
): Promise<FixFormState> {
  const id = parseFixId(formData.get("reportId"));
  const status = text(formData, "status");
  if (!id) return { status: "error", message: fixErrorMessage({ message: "report_not_found" }) };
  if (!STATUSES.some((s) => s.id === status)) {
    return { status: "error", message: fixErrorMessage({ message: "invalid_status" }) };
  }
  const note = text(formData, "note").trim();
  if (note.length > STATUS_NOTE_MAX) {
    return { status: "error", message: `Keep the note to ${STATUS_NOTE_MAX} characters.` };
  }

  const supabase = await signedInClient();
  const { error } = await supabase.rpc("set_fix_status", {
    p_report: id,
    p_status: status,
    p_note: note === "" ? undefined : note,
  });
  if (error) {
    if (!isExpectedFixError(error)) logger.error("fixes.status_failed", { error });
    return { status: "error", message: fixErrorMessage(error) };
  }
  refresh(id);
  return { status: "saved" };
}

export async function takeChase(formData: FormData): Promise<void> {
  const id = parseFixId(formData.get("reportId"));
  if (!id) return;
  const supabase = await signedInClient();
  const { error } = await supabase.rpc("take_fix_chase", { p_report: id });
  if (error && !isExpectedFixError(error)) logger.error("fixes.take_chase_failed", { error });
  refresh(id);
}

/** Hands the chase to someone, or clears it when no person is chosen. */
export async function setChaser(formData: FormData): Promise<void> {
  const id = parseFixId(formData.get("reportId"));
  if (!id) return;
  const chosen = text(formData, "chaser");
  const person = chosen === "" ? null : parseFixId(chosen);
  if (chosen !== "" && !person) return;

  const supabase = await signedInClient();
  const { error } = await supabase.rpc("set_fix_chaser", {
    p_report: id,
    // Null clears the chase; the generated type does not know the parameter may be null.
    p_profile: person as string,
  });
  if (error && !isExpectedFixError(error)) logger.error("fixes.set_chaser_failed", { error });
  refresh(id);
}

export async function hideReport(formData: FormData): Promise<void> {
  const id = parseFixId(formData.get("reportId"));
  if (!id) return;
  const supabase = await signedInClient();
  const { error } = await supabase.rpc("hide_fix_report", { p_report: id });
  if (error && !isExpectedFixError(error)) logger.error("fixes.hide_failed", { error });
  refresh();
  redirect("/more/fixes");
}
