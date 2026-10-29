"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { logger } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { isSafeInternalPath, parseNotificationId } from "./schemas";

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
