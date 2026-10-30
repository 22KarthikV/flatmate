// Kept free of server-only imports so client components can use it.

export const CATEGORIES = [
  { id: "groceries", label: "Groceries" },
  { id: "household", label: "Household" },
  { id: "bills", label: "Bills" },
  { id: "takeaway", label: "Takeaway" },
  { id: "transport", label: "Transport" },
  { id: "fun", label: "Fun" },
  { id: "other", label: "Other" },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];

export const DESCRIPTION_MAX = 80;

export function isCategory(value: unknown): value is CategoryId {
  return CATEGORIES.some((category) => category.id === value);
}

export function categoryLabel(id: string): string {
  return CATEGORIES.find((category) => category.id === id)?.label ?? "Other";
}

export type SplitMode = "equal" | "exact" | "percent" | "one";

export const SPLIT_MODES: readonly { id: SplitMode; label: string }[] = [
  { id: "equal", label: "Equally" },
  { id: "exact", label: "By amounts" },
  { id: "percent", label: "By percentages" },
  { id: "one", label: "One person" },
];

export function isSplitMode(value: unknown): value is SplitMode {
  return SPLIT_MODES.some((mode) => mode.id === value);
}

export type ExpenseFormState = { status: "idle" } | { status: "error"; message: string };
