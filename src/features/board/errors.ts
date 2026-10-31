const GENERAL = "We couldn’t save that. Please try again.";

const MESSAGES: Record<string, string> = {
  not_allowed: "Only an owner or admin can do that.",
  invalid_body: "Write between 1 and 280 characters.",
  invalid_expiry: "Choose how long it stays up: 1 day, 3 days, 1 week or 1 month.",
  posting_too_fast: "You’ve posted 5 notes today. Try again tomorrow.",
  too_many_pinned: "Three posts are already pinned. Unpin one first.",
  post_not_found: "We couldn’t find that post. It may have been removed.",
};

/** A friendly sentence for what the database function said. */
export function boardErrorMessage(error: { code?: string; message?: string } | null): string {
  return (error?.message && MESSAGES[error.message]) || GENERAL;
}

/** True for the outcomes above, which are expected; anything else is worth logging. */
export function isExpectedBoardError(error: { message?: string } | null): boolean {
  return Boolean(error?.message && MESSAGES[error.message]);
}
