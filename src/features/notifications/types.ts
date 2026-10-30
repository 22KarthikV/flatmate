// Kept free of imports so client components can use it without pulling in zod.

export type NotificationType =
  | "member_joined"
  | "member_left"
  | "role_changed"
  | "expense_added"
  | "expense_changed"
  | "expense_voided"
  | "settlement_pending"
  | "settlement_confirmed"
  | "settlement_declined"
  | "payment_nudge"
  | "rent_charged"
  | "recurring_posted"
  | "recurring_reminder"
  | "bill_amount_needed"
  | "rent_payment_pending"
  | "rent_payment_decided"
  | "recurring_attention"
  | "availability_open"
  | "availability_nudge"
  | "rota_week_ready"
  | "chore_assigned"
  | "chore_unassigned"
  | "chore_due"
  | "chore_overdue";

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
  {
    type: "expense_added",
    label: "A shared expense includes you",
    description: "When a flatmate adds an expense with a share for you.",
    defaultInApp: true,
    defaultPush: true,
    snoozable: false,
  },
  {
    type: "expense_changed",
    label: "An expense is corrected",
    description: "When an expense that includes you is corrected.",
    defaultInApp: true,
    defaultPush: false,
    snoozable: false,
  },
  {
    type: "expense_voided",
    label: "An expense is cancelled",
    description: "When an expense that included you is cancelled.",
    defaultInApp: true,
    defaultPush: false,
    snoozable: false,
  },
  {
    type: "settlement_pending",
    label: "Someone says they paid you",
    description: "When a flatmate records a payment to you for you to confirm.",
    defaultInApp: true,
    defaultPush: true,
    snoozable: false,
  },
  {
    type: "settlement_confirmed",
    label: "Your payment is confirmed",
    description: "When a flatmate confirms a payment you made.",
    defaultInApp: true,
    defaultPush: true,
    snoozable: false,
  },
  {
    type: "settlement_declined",
    label: "Your payment is not confirmed",
    description: "When a flatmate declines a payment you recorded.",
    defaultInApp: true,
    defaultPush: true,
    snoozable: false,
  },
  {
    type: "payment_nudge",
    label: "A gentle reminder about money",
    description: "When you have owed money in the flat for a while.",
    defaultInApp: true,
    defaultPush: false,
    snoozable: true,
  },
  {
    type: "rent_charged",
    label: "Your rent is created",
    description: "When your rent for a month has been created.",
    defaultInApp: true,
    defaultPush: true,
    snoozable: false,
  },
  {
    type: "recurring_posted",
    label: "A monthly bill includes you",
    description: "When a monthly bill such as gas or Wi-Fi is created with a share for you.",
    defaultInApp: true,
    defaultPush: true,
    snoozable: false,
  },
  {
    type: "recurring_reminder",
    label: "Your rent is still unpaid",
    description: "Reminders before and after your rent is due, until it is paid.",
    defaultInApp: true,
    defaultPush: true,
    snoozable: true,
  },
  {
    type: "bill_amount_needed",
    label: "A bill needs its amount",
    description: "When you pay a bill that changes each month and this month's amount is needed.",
    defaultInApp: true,
    defaultPush: true,
    snoozable: false,
  },
  {
    type: "rent_payment_pending",
    label: "A rent payment to confirm",
    description: "When a flatmate says they paid their rent and you collect or manage it.",
    defaultInApp: true,
    defaultPush: true,
    snoozable: false,
  },
  {
    type: "rent_payment_decided",
    label: "Your rent payment is reviewed",
    description: "When your rent payment is confirmed or not.",
    defaultInApp: true,
    defaultPush: true,
    snoozable: false,
  },
  {
    type: "recurring_attention",
    label: "Rent or bills need an admin",
    description: "When a rent or bill was paused, or someone left owing rent. Admins only.",
    defaultInApp: true,
    defaultPush: false,
    snoozable: false,
  },
  {
    type: "availability_open",
    label: "Next week's rota is open for answers",
    description: "When you can say which days you are around next week.",
    defaultInApp: true,
    defaultPush: false,
    snoozable: false,
  },
  {
    type: "availability_nudge",
    label: "A reminder to say which days you are around",
    description: "Before the deadline, if you have not answered yet.",
    defaultInApp: true,
    defaultPush: false,
    snoozable: true,
  },
  {
    type: "rota_week_ready",
    label: "The rota is ready",
    description: "When a new week of chores has been given out.",
    defaultInApp: true,
    defaultPush: true,
    snoozable: false,
  },
  {
    type: "chore_assigned",
    label: "You are given chores",
    description: "When chores are given to you for the week.",
    defaultInApp: true,
    defaultPush: true,
    snoozable: false,
  },
  {
    type: "chore_unassigned",
    label: "A chore has nobody to do it",
    description: "When nobody was around for a chore. Admins only.",
    defaultInApp: true,
    defaultPush: false,
    snoozable: false,
  },
  {
    type: "chore_due",
    label: "A chore is due today",
    description: "On the morning a chore of yours is due.",
    defaultInApp: true,
    defaultPush: true,
    snoozable: false,
  },
  {
    type: "chore_overdue",
    label: "A chore is overdue",
    description: "When a chore of yours was not finished on its day.",
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
