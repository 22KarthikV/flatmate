// Kept free of server-only imports so client components can use it.

export type RecurringFormState = { status: "idle" } | { status: "error"; message: string };

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export const MONTH_SHORT = MONTH_NAMES.map((name) => name.slice(0, 3));
