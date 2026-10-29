"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { logger } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import {
  isSafeInternalPath,
  parseNotificationId,
  parsePreferenceForm,
  parseSnoozeChoice,
  snoozeUntil,
} from "./schemas";
import { isNotificationType } from "./types";

/** Marks one notification read and goes to the screen it points at. */
export async function openNotification(formData: FormData): Promise<void> {
  const id = parseNotificationId(formData.get("id"));
  if (!id) redirect("/notifications");

  const supabase = await createSupabaseServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims.sub) redirect("/sign-in?next=%2Fnotifications");

  // Row-level security means this only finds the caller's own notification.
  const { data: row } = await supabase
    .from("notifications")
    .select("href")
    .eq("id", id)
    .maybeSingle();
  const { error } = await supabase.rpc("mark_read", { p_id: id });
  if (error) logger.error("notifications.mark_read_failed", { error });

  revalidatePath("/", "layout");
  redirect(row && isSafeInternalPath(row.href) ? row.href : "/notifications");
}

export async function markAllRead(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims.sub) redirect("/sign-in?next=%2Fnotifications");

  const { error } = await supabase.rpc("mark_all_read");
  if (error) logger.error("notifications.mark_all_read_failed", { error });

  revalidatePath("/", "layout");
}

/** Saves this person's in-app and push choice for one type. Their own row only (the function uses their id). */
export async function savePreference(formData: FormData): Promise<void> {
  const input = parsePreferenceForm(formData, isNotificationType);
  if (!input) return;

  const supabase = await createSupabaseServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims.sub) redirect("/sign-in?next=%2Fmore%2Fnotifications");

  const { error } = await supabase.rpc("set_notification_preference", {
    p_type: input.type,
    p_in_app: input.inApp,
    p_push: input.push,
  });
  if (error) logger.error("notifications.save_preference_failed", { error });

  revalidatePath("/more/notifications");
}

/** Hides a reminder from the unread count until the chosen time. */
export async function snoozeNotification(formData: FormData): Promise<void> {
  const id = parseNotificationId(formData.get("id"));
  const choice = parseSnoozeChoice(formData.get("choice"));
  if (!id || !choice) return;

  const supabase = await createSupabaseServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims.sub) redirect("/sign-in?next=%2Fnotifications");

  const { error } = await supabase.rpc("snooze", {
    p_id: id,
    p_until: snoozeUntil(choice, new Date()).toISOString(),
  });
  if (error) logger.error("notifications.snooze_failed", { error });

  revalidatePath("/", "layout");
}
