"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { logger } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import {
  coarseDeviceLabel,
  isSafeInternalPath,
  parseNotificationId,
  parsePreferencesForm,
  parsePushSubscription,
  parseSnoozeChoice,
  snoozeUntil,
} from "./schemas";
import { NOTIFICATION_TYPES, resolvePreference, type SavePreferencesState } from "./types";

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

/**
 * Saves every choice on the settings page at once. Only the types that differ from what the person
 * already has are written, and each write is for their own row (the database function uses their id).
 */
export async function savePreferences(
  _previous: SavePreferencesState,
  formData: FormData,
): Promise<SavePreferencesState> {
  const supabase = await createSupabaseServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims.sub) redirect("/sign-in?next=%2Fmore%2Fnotifications");

  const wanted = parsePreferencesForm(
    formData,
    NOTIFICATION_TYPES.map((entry) => entry.type),
  );
  const { data: saved } = await supabase
    .from("notification_preferences")
    .select("type, in_app, push");

  const changes = wanted.filter((choice) => {
    const info = NOTIFICATION_TYPES.find((entry) => entry.type === choice.type);
    if (!info) return false;
    const current = resolvePreference(
      info,
      (saved ?? []).find((row) => row.type === choice.type),
    );
    return current.inApp !== choice.inApp || current.push !== choice.push;
  });

  const results = await Promise.all(
    changes.map((choice) =>
      supabase.rpc("set_notification_preference", {
        p_type: choice.type,
        p_in_app: choice.inApp,
        p_push: choice.push,
      }),
    ),
  );
  if (results.some((result) => result.error)) {
    logger.error("notifications.save_preferences_failed", {
      error: results.find((result) => result.error)?.error,
    });
    revalidatePath("/more/notifications");
    return { status: "error", message: "We couldn’t save all your choices. Please try again." };
  }

  revalidatePath("/more/notifications");
  return { status: "saved", changed: changes.length };
}

export type PushActionResult = { ok: true; id: string } | { ok: false; message: string };

/**
 * Stores this browser's push subscription for the signed-in person. The database function sets the
 * owner from the session, so one person can never register a device for someone else. Only a coarse
 * device label is kept, never the full user agent.
 */
export async function savePushSubscription(input: unknown): Promise<PushActionResult> {
  const subscription = parsePushSubscription(input);
  if (!subscription) return { ok: false, message: "That device could not be registered." };

  const supabase = await createSupabaseServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims.sub) return { ok: false, message: "Sign in again to turn on push." };

  const { data, error } = await supabase.rpc("save_push_subscription", {
    p_endpoint: subscription.endpoint,
    p_p256dh: subscription.p256dh,
    p_auth: subscription.auth,
    p_user_agent: coarseDeviceLabel((await headers()).get("user-agent")),
  });
  if (error || !data) {
    logger.error("notifications.save_push_subscription_failed", { error });
    return { ok: false, message: "Push could not be turned on. Try again in a moment." };
  }

  revalidatePath("/more/notifications");
  return { ok: true, id: data };
}

/** Removes one of the person's own devices. Row-level security means nobody else's can be deleted. */
export async function removePushSubscription(id: unknown): Promise<{ ok: boolean }> {
  const subscriptionId = parseNotificationId(id);
  if (!subscriptionId) return { ok: false };

  const supabase = await createSupabaseServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims.sub) return { ok: false };

  const { error } = await supabase.from("push_subscriptions").delete().eq("id", subscriptionId);
  if (error) {
    logger.error("notifications.remove_push_subscription_failed", { error });
    return { ok: false };
  }

  revalidatePath("/more/notifications");
  return { ok: true };
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
