const GENERAL = "We couldn’t save that. Please try again.";

const MESSAGES: Record<string, string> = {
  not_allowed: "You can’t do that in this flat.",
  invalid_amount: "The amount must be between 1p and £10,000.00.",
  invalid_description: "Add a short description of up to 80 characters.",
  invalid_category: "Choose a category.",
  invalid_date: "That date isn’t allowed. Use a date from the last 5 years up to 30 days ahead.",
  invalid_shares: "Check who the expense is shared between.",
  shares_must_add_up: "The shares don’t add up to the amount. Please check them.",
  not_a_member: "Everyone on an expense must still be in the flat.",
  expense_not_found: "We couldn’t find that expense.",
  already_voided: "That expense has already been cancelled.",
  invalid_recipient: "Choose who you paid.",
  settlement_not_found: "We couldn’t find that payment.",
  settlement_not_pending: "That payment has already been dealt with.",
};

/** A friendly sentence for what the database function said, or a general one for anything unexpected. */
export function expenseErrorMessage(error: { code?: string; message?: string } | null): string {
  return (error?.message && MESSAGES[error.message]) || GENERAL;
}

/** True for the outcomes above, which are expected; anything else is worth logging. */
export function isExpectedExpenseError(error: { message?: string } | null): boolean {
  return Boolean(error?.message && MESSAGES[error.message]);
}
