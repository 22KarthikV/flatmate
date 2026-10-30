// Kept free of server-only imports so client components can use it.

export const CHORE_NAME_MAX = 40;
export const CHECKLIST_ITEM_MAX = 80;
export const CHECKLIST_MAX_ITEMS = 20;
export const MAX_ACTIVE_CHORES = 12;

/** Sunday first: weeks run Sunday to Saturday (SPEC-rota T2), and 0 is Sunday in the database. */
export const WEEKDAYS = [
  { id: 0, label: "Sunday" },
  { id: 1, label: "Monday" },
  { id: 2, label: "Tuesday" },
  { id: 3, label: "Wednesday" },
  { id: 4, label: "Thursday" },
  { id: 5, label: "Friday" },
  { id: 6, label: "Saturday" },
] as const;

export const EFFORTS = [
  { id: 1, label: "1 - a few minutes" },
  { id: 2, label: "2 - light" },
  { id: 3, label: "3 - medium" },
  { id: 4, label: "4 - hard" },
  { id: 5, label: "5 - the big one" },
] as const;

export function weekdayLabel(dow: number): string {
  return WEEKDAYS.find((day) => day.id === dow)?.label ?? "Sunday";
}

export type Cadence = "weekly" | "every_n_days";

export interface ChoreItem {
  id: string;
  position: number;
  text: string;
}

export interface Chore {
  id: string;
  name: string;
  cadence: Cadence;
  preferredDow: number | null;
  everyNDays: number | null;
  effort: number;
  needsSignoff: boolean;
  archived: boolean;
  items: ChoreItem[];
}

/** One line saying how often a chore comes round, for lists. */
export function describeCadence(chore: Pick<Chore, "cadence" | "preferredDow" | "everyNDays">) {
  if (chore.cadence === "weekly") return `Weekly, on ${weekdayLabel(chore.preferredDow ?? 0)}`;
  const n = chore.everyNDays ?? 1;
  return n === 1 ? "Every day" : `Every ${n} days`;
}

export type ChoreFormState =
  { status: "idle" } | { status: "error"; message: string } | { status: "saved" };

export type AvailabilityFormState =
  { status: "idle" } | { status: "error"; message: string } | { status: "saved" };

export type GenerateFormState =
  { status: "idle" } | { status: "error"; message: string } | { status: "saved"; message: string };
