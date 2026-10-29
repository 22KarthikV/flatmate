// Kept free of imports so client components can use it without pulling in zod.

export const HOUSEHOLD_NAME_MAX = 50;

export type HouseholdRole = "owner" | "admin" | "member";

export type CreateFlatState =
  { status: "idle" } | { status: "created" } | { status: "error"; message: string };
