// Kept free of imports so the client form can use it without pulling in anything heavy.

export const DELETE_PHRASE = "DELETE";

/** The typed confirmation the person must give before an account is deleted. */
export function isDeleteConfirmed(value: FormDataEntryValue | string | null | undefined): boolean {
  return typeof value === "string" && value.trim() === DELETE_PHRASE;
}

export type DeleteState = { status: "idle" } | { status: "error"; message: string };
