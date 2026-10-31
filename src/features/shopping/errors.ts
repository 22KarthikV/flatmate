import { expenseErrorMessage } from "@/features/ledger/errors";

const GENERAL = "We couldn’t save that. Please try again.";

const MESSAGES: Record<string, string> = {
  not_allowed: "Only the person who added it, or an admin, can do that.",
  invalid_name: "Type what the flat needs, in 60 characters or fewer.",
  invalid_note: "Keep the note to 40 characters or fewer.",
  list_full: "The shopping list is full (100 things). Tick or remove some first.",
  item_not_found: "We couldn’t find that item. It may have been removed.",
  already_in_expense: "That item is already part of an expense.",
  not_bought: "Tick everything you bought before making an expense.",
  invalid_items: "Choose between 1 and 30 bought items.",
};

type DbError = { code?: string; message?: string } | null;

/** A friendly sentence for what the database said. Money rules reuse the ledger's wording. */
export function shoppingErrorMessage(error: DbError): string {
  if (error?.message && MESSAGES[error.message]) return MESSAGES[error.message];
  const ledger = expenseErrorMessage(error);
  return ledger;
}

/** True for outcomes we expect; anything else is worth logging. */
export function isExpectedShoppingError(error: { message?: string } | null): boolean {
  return Boolean(
    error?.message && (MESSAGES[error.message] || shoppingErrorMessage(error) !== GENERAL),
  );
}
