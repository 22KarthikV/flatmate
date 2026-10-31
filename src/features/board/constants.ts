// Kept free of server-only imports so client components can use it.

export const POST_MAX = 280;
export const MAX_PINNED = 3;

export const EXPIRY_CHOICES = [
  { days: 1, label: "1 day" },
  { days: 3, label: "3 days" },
  { days: 7, label: "1 week" },
  { days: 30, label: "1 month" },
] as const;
export const DEFAULT_EXPIRY_DAYS = 7;

export type BoardFormState =
  { status: "idle" } | { status: "saved" } | { status: "error"; message: string };
