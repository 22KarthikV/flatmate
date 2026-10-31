"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { londonToday } from "@/features/ledger/form";
import { logger } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { BinFormState } from "./constants";
import { binErrorMessage, isExpectedBinError } from "./errors";
import { parseBinFields, parseBinId, parseExceptionFields } from "./schemas";

async function signedInClient() {
  const supabase = await createSupabaseServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims.sub) redirect("/sign-in?next=%2Fmore%2Fbins");
  return supabase;
}

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

function refresh() {
  revalidatePath("/more/bins");
  revalidatePath("/more/bins/manage");
}

/** Adds a bin, or changes one when the form carries its id. The database checks everything again. */
export async function saveBin(_previous: BinFormState, formData: FormData): Promise<BinFormState> {
  const parsed = parseBinFields(
    {
      name: text(formData, "name"),
      colour: text(formData, "colour"),
      anchorOn: text(formData, "anchorOn"),
      everyWeeks: text(formData, "everyWeeks"),
    },
    londonToday(),
  );
  if (!parsed.ok) return { status: "error", message: parsed.message };

  const supabase = await signedInClient();
  const { error } = await supabase.rpc("save_bin_stream", {
    // Null adds a bin; the generated type does not know the parameter may be null.
    p_id: parseBinId(formData.get("binId")) as string,
    p_name: parsed.value.name,
    p_colour: parsed.value.colour,
    p_anchor_on: parsed.value.anchorOn,
    p_every_weeks: parsed.value.everyWeeks,
  });
  if (error) {
    if (!isExpectedBinError(error)) logger.error("bins.save_failed", { error });
    return { status: "error", message: binErrorMessage(error) };
  }
  refresh();
  return { status: "saved" };
}

export async function archiveBin(formData: FormData): Promise<void> {
  const id = parseBinId(formData.get("binId"));
  if (!id) return;
  const supabase = await signedInClient();
  const { error } = await supabase.rpc("archive_bin_stream", { p_id: id });
  if (error && !isExpectedBinError(error)) logger.error("bins.archive_failed", { error });
  refresh();
}

/** Skips or moves one collection of a bin. */
export async function saveException(
  _previous: BinFormState,
  formData: FormData,
): Promise<BinFormState> {
  const parsed = parseExceptionFields({
    streamId: text(formData, "streamId"),
    originalOn: text(formData, "originalOn"),
    kind: text(formData, "kind"),
    movedTo: text(formData, "movedTo"),
    note: text(formData, "note"),
  });
  if (!parsed.ok) return { status: "error", message: parsed.message };
  const { value } = parsed;

  const supabase = await signedInClient();
  const { error } = await supabase.rpc("set_bin_exception", {
    p_stream: value.streamId,
    p_original_on: value.originalOn,
    p_kind: value.kind,
    p_moved_to: value.movedTo as string,
    p_note: value.note ?? undefined,
  });
  if (error) {
    if (!isExpectedBinError(error)) logger.error("bins.exception_failed", { error });
    return { status: "error", message: binErrorMessage(error) };
  }
  refresh();
  return { status: "saved" };
}

export async function clearException(formData: FormData): Promise<void> {
  const id = parseBinId(formData.get("exceptionId"));
  if (!id) return;
  const supabase = await signedInClient();
  const { error } = await supabase.rpc("clear_bin_exception", { p_id: id });
  if (error && !isExpectedBinError(error)) logger.error("bins.clear_failed", { error });
  refresh();
}
