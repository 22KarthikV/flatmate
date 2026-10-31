// Kept free of server-only imports so client components can use it.

export const ITEM_NAME_MAX = 60;
export const ITEM_NOTE_MAX = 40;
export const MAX_BUY_ITEMS = 30;

export type ShoppingFormState =
  { status: "idle" } | { status: "saved" } | { status: "error"; message: string };
