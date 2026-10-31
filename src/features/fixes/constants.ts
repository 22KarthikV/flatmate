// Kept free of server-only imports so client components can use it.

export const TITLE_MAX = 80;
export const DETAILS_MAX = 500;
export const LOCATION_MAX = 40;
export const NOTE_MAX = 300;
export const STATUS_NOTE_MAX = 200;

export const STATUSES = [
  { id: "open", label: "Open" },
  { id: "in_progress", label: "In progress" },
  { id: "fixed", label: "Fixed" },
] as const;

export type FixStatus = (typeof STATUSES)[number]["id"];

export type FixFormState =
  { status: "idle" } | { status: "saved" } | { status: "error"; message: string };
