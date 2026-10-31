"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { logger } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { EventFormState } from "./constants";
import { eventErrorMessage, isExpectedEventError } from "./errors";
import {
  londonLocalToInstant,
  parseAnswer,
  parseEventForm,
  parseEventId,
  parseOption,
  parseTextFields,
  rawEventFromFormData,
} from "./schemas";

async function signedInClient() {
  const supabase = await createSupabaseServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims.sub) redirect("/sign-in?next=%2Fevents");
  return supabase;
}

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/**
 * Proposes an event. The form is checked here for friendly messages; the database function checks
 * everything again and is the real enforcement. On success the person lands on the event.
 */
export async function proposeEvent(
  _previous: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const parsed = parseEventForm(rawEventFromFormData(formData), new Date());
  if (!parsed.ok) return { status: "error", message: parsed.message };
  const { value } = parsed;

  const supabase = await signedInClient();
  const { data, error } = await supabase.rpc("propose_event", {
    p_title: value.title,
    p_description: value.description,
    p_location: value.location ?? "",
    p_options: value.options,
    p_deadline: value.deadline,
  });
  if (error || !data) {
    if (!isExpectedEventError(error)) logger.error("events.propose_failed", { error });
    return { status: "error", message: eventErrorMessage(error) };
  }

  revalidatePath("/events", "layout");
  redirect(`/events/${data}`);
}

/** Fixes the title, description and place, and moves the deadline while voting is open. */
export async function updateEvent(
  _previous: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const id = parseEventId(formData.get("eventId"));
  if (!id) return { status: "error", message: eventErrorMessage({ message: "event_not_found" }) };
  const fields = parseTextFields({
    title: text(formData, "title"),
    description: text(formData, "description"),
    location: text(formData, "location"),
  });
  if (!fields.ok) return { status: "error", message: fields.message };

  let deadline: string | undefined;
  const rawDeadline = text(formData, "deadline");
  if (rawDeadline !== "") {
    const instant = londonLocalToInstant(rawDeadline);
    if (!instant) return { status: "error", message: "Choose when voting closes." };
    deadline = instant.toISOString();
  }

  const supabase = await signedInClient();
  const { error } = await supabase.rpc("update_event", {
    p_event: id,
    p_title: fields.value.title,
    p_description: fields.value.description,
    p_location: fields.value.location ?? "",
    p_deadline: deadline,
  });
  if (error) {
    if (!isExpectedEventError(error)) logger.error("events.update_failed", { error });
    return { status: "error", message: eventErrorMessage(error) };
  }

  revalidatePath("/events", "layout");
  return { status: "saved", message: "Saved." };
}

/** Adds a date while voting is open. */
export async function addOption(
  _previous: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const id = parseEventId(formData.get("eventId"));
  if (!id) return { status: "error", message: eventErrorMessage({ message: "event_not_found" }) };
  const parsed = parseOption(text(formData, "start"), text(formData, "end"), new Date());
  if (!parsed.ok) return { status: "error", message: parsed.message };

  const supabase = await signedInClient();
  const { error } = await supabase.rpc("add_event_option", {
    p_event: id,
    p_starts_at: parsed.startsAt.toISOString(),
    p_ends_at: parsed.endsAt?.toISOString(),
  });
  if (error) {
    if (!isExpectedEventError(error)) logger.error("events.add_option_failed", { error });
    return { status: "error", message: eventErrorMessage(error) };
  }

  revalidatePath("/events", "layout");
  return { status: "saved", message: "Date added." };
}

async function call(
  fn: "remove_event_option" | "cast_event_vote" | "cancel_event" | "decide_event_tie",
  args: Record<string, string | null>,
): Promise<void> {
  const supabase = await signedInClient();
  const { error } = await supabase.rpc(fn as "cancel_event", args as { p_event: string });
  if (error && !isExpectedEventError(error)) logger.error(`events.${fn}_failed`, { error });
  revalidatePath("/events", "layout");
}

/** Records yes, maybe or no on a date, or clears it. The database applies the majority rule. */
export async function castVote(formData: FormData): Promise<void> {
  const optionId = parseEventId(formData.get("optionId"));
  const answer = parseAnswer(formData.get("answer"));
  if (!optionId || answer === undefined) return;
  await call("cast_event_vote", { p_option: optionId, p_answer: answer });
}

export async function removeOption(formData: FormData): Promise<void> {
  const optionId = parseEventId(formData.get("optionId"));
  if (optionId) await call("remove_event_option", { p_option: optionId });
}

export async function cancelEvent(formData: FormData): Promise<void> {
  const id = parseEventId(formData.get("eventId"));
  if (!id) return;
  const reason = text(formData, "reason").trim().slice(0, 100);
  await call("cancel_event", { p_event: id, p_reason: reason === "" ? null : reason });
}

export async function decideTie(formData: FormData): Promise<void> {
  const id = parseEventId(formData.get("eventId"));
  const optionId = parseEventId(formData.get("optionId"));
  if (id && optionId) await call("decide_event_tie", { p_event: id, p_option: optionId });
}
