// Kept free of imports so client components can use it without pulling in zod.

export const DISPLAY_NAME_MAX = 50;

export type RenameState =
  { status: "idle" } | { status: "saved"; message: string } | { status: "error"; message: string };
