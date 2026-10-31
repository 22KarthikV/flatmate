"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { londonToday } from "@/features/ledger/form";
import { logger } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { MeterFormState } from "./constants";
import { isExpectedMeterError, meterErrorMessage } from "./errors";
import { parseMeterFields, parseMeterId, parseReadingFields } from "./schemas";

async function signedInClient() {
  const supabase = await createSupabaseServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims.sub) redirect("/sign-in?next=%2Fmore%2Fmeters");
  return supabase;
}

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

function refresh(id?: string) {
  revalidatePath("/more/meters");
  if (id) revalidatePath(`/more/meters/${id}`);
}

/** Adds a meter (admin). The database checks everything again. */
export async function addMeter(
  _previous: MeterFormState,
  formData: FormData,
): Promise<MeterFormState> {
  const parsed = parseMeterFields({
    kind: text(formData, "kind"),
    label: text(formData, "label"),
    unit: text(formData, "unit"),
  });
  if (!parsed.ok) return { status: "error", message: parsed.message };

  const supabase = await signedInClient();
  const { error } = await supabase.rpc("save_meter", {
    // Null adds a meter; the generated type does not know the parameter may be null.
    p_id: null as unknown as string,
    p_kind: parsed.value.kind,
    p_label: parsed.value.label as string,
    p_unit: parsed.value.unit,
  });
  if (error) {
    if (!isExpectedMeterError(error)) logger.error("meters.add_failed", { error });
    return { status: "error", message: meterErrorMessage(error) };
  }
  refresh();
  redirect("/more/meters");
}

/**
 * Records a reading. A number lower than the last one is refused unless the person confirms the
 * meter was replaced or rolled over, so the form is told to ask.
 */
export async function addReading(
  _previous: MeterFormState,
  formData: FormData,
): Promise<MeterFormState> {
  const meterId = parseMeterId(formData.get("meterId"));
  if (!meterId)
    return { status: "error", message: meterErrorMessage({ message: "meter_not_found" }) };
  const parsed = parseReadingFields(
    {
      readOn: text(formData, "readOn"),
      value: text(formData, "value"),
      note: text(formData, "note"),
      reset: formData.get("reset") === "yes",
    },
    londonToday(),
  );
  if (!parsed.ok) return { status: "error", message: parsed.message };

  const supabase = await signedInClient();
  const { error } = await supabase.rpc("record_meter_reading", {
    p_meter: meterId,
    p_read_on: parsed.value.readOn,
    p_value: parsed.value.value,
    p_note: parsed.value.note as string,
    p_is_reset: parsed.value.isReset,
  });
  if (error) {
    if (!isExpectedMeterError(error)) logger.error("meters.record_failed", { error });
    return {
      status: "error",
      message: meterErrorMessage(error),
      askReset: error.message === "lower_than_previous" || undefined,
    };
  }
  refresh(meterId);
  return { status: "saved" };
}

export async function cancelReading(formData: FormData): Promise<void> {
  const id = parseMeterId(formData.get("readingId"));
  if (!id) return;
  const supabase = await signedInClient();
  const { error } = await supabase.rpc("void_meter_reading", { p_id: id });
  if (error && !isExpectedMeterError(error)) logger.error("meters.cancel_failed", { error });
  refresh(parseMeterId(formData.get("meterId")) ?? undefined);
}

export async function archiveMeter(formData: FormData): Promise<void> {
  const id = parseMeterId(formData.get("meterId"));
  if (!id) return;
  const supabase = await signedInClient();
  const { error } = await supabase.rpc("archive_meter", { p_id: id });
  if (error && !isExpectedMeterError(error)) logger.error("meters.archive_failed", { error });
  refresh();
  redirect("/more/meters");
}
