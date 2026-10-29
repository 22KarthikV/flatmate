import "server-only";

import { getRequestSession } from "@/features/identity/session-claims";

import { NOTIFICATION_TYPES, resolvePreference, type NotificationTypeInfo } from "./types";

export interface PreferenceView {
  info: NotificationTypeInfo;
  inApp: boolean;
  push: boolean;
}

/** Every notification type with this person's choice, or the type's default when they have none. */
export async function getPreferences(): Promise<PreferenceView[]> {
  const { supabase, claims } = await getRequestSession();
  const saved = claims?.sub
    ? ((await supabase.from("notification_preferences").select("type, in_app, push")).data ?? [])
    : [];

  return NOTIFICATION_TYPES.map((info) => ({
    info,
    ...resolvePreference(
      info,
      saved.find((row) => row.type === info.type),
    ),
  }));
}
