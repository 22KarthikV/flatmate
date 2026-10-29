// Kept free of imports so client components can use it without pulling in zod.

export type NotificationType = "member_joined" | "member_left" | "role_changed";

export interface NotificationTypeInfo {
  type: NotificationType;
  /** Shown on the settings page. */
  label: string;
  description: string;
  defaultInApp: boolean;
  defaultPush: boolean;
  snoozable: boolean;
}

/**
 * Every kind of notification. The defaults here are mirrored by the `notification_types` rows in
 * the migrations (the database needs them to decide on push); a test keeps the two in step.
 * Later modules add their own entries here and their own rows in a migration.
 */
export const NOTIFICATION_TYPES: readonly NotificationTypeInfo[] = [
  {
    type: "member_joined",
    label: "Someone joins the flat",
    description: "When a new flatmate joins.",
    defaultInApp: true,
    defaultPush: false,
    snoozable: false,
  },
  {
    type: "member_left",
    label: "Someone leaves the flat",
    description: "When a flatmate leaves or is removed.",
    defaultInApp: true,
    defaultPush: false,
    snoozable: false,
  },
  {
    type: "role_changed",
    label: "Your role changes",
    description: "When you are made an admin or become a member again.",
    defaultInApp: true,
    defaultPush: true,
    snoozable: false,
  },
];

export function getNotificationType(type: string): NotificationTypeInfo | undefined {
  return NOTIFICATION_TYPES.find((entry) => entry.type === type);
}

export interface SavedPreference {
  in_app: boolean;
  push: boolean;
}

/** A saved choice wins; otherwise the type's own defaults apply. */
export function resolvePreference(
  info: NotificationTypeInfo,
  saved: SavedPreference | null | undefined,
): { inApp: boolean; push: boolean } {
  return { inApp: saved?.in_app ?? info.defaultInApp, push: saved?.push ?? info.defaultPush };
}

export function isNotificationType(value: unknown): value is NotificationType {
  return typeof value === "string" && getNotificationType(value) !== undefined;
}
