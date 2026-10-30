const GENERAL = "We couldn’t save that. Please try again.";

const MESSAGES: Record<string, string> = {
  not_allowed: "You can’t do that in this flat.",
  invalid_kind: "Choose rent or a bill.",
  invalid_name: "Give it a name of up to 50 characters.",
  invalid_due_day: "The due day must be between 1 and 28.",
  invalid_months: "Choose at least one month.",
  invalid_amount: "The amount must be between 1p and £10,000.00.",
  invalid_split: "Choose how it is shared.",
  invalid_shares: "Check who shares it, and that percentages add up to 100%.",
  invalid_rooms:
    "Check the rooms: each needs a name, a rent and someone living in it, and nobody can be in two.",
  invalid_reason: "Say why, in up to 200 characters.",
  invalid_period: "Choose a month.",
  not_a_member: "Everyone named must still be in the flat.",
  collector_must_be_admin:
    "The person who collects the rent must be an owner or admin in the flat.",
  template_not_found: "We couldn’t find that rent or bill.",
  template_ended: "That rent or bill has ended.",
  already_paused: "That is already paused.",
  not_paused: "That isn’t paused.",
  cannot_resume:
    "It can’t resume yet: someone it names has left, or the person who collects or pays it. Edit it first.",
  month_passed: "That month is already past, so it can’t be skipped.",
  already_created: "That month has already been created.",
  already_ended: "That has already ended.",
  instance_not_found: "We couldn’t find that bill.",
  already_entered: "The amount for this month has already been entered.",
  not_awaiting: "This month isn’t waiting for an amount.",
  no_sharers: "Nobody is left to share this bill. Edit it first.",
  sharer_left: "Someone who shares this bill has left. An admin needs to edit it first.",
  nothing_owed: "You don’t owe any rent right now.",
  amount_exceeds_owed: "That is more than you still owe.",
  payment_not_found: "We couldn’t find that payment.",
  already_decided: "That payment has already been dealt with.",
  not_confirmed: "Only a confirmed payment can be reversed.",
  already_voided: "That payment has already been reversed.",
};

/** A friendly sentence for what the database function said, or a general one for anything unexpected. */
export function recurringErrorMessage(error: { code?: string; message?: string } | null): string {
  return (error?.message && MESSAGES[error.message]) || GENERAL;
}

/** True for the outcomes above, which are expected; anything else is worth logging. */
export function isExpectedRecurringError(error: { message?: string } | null): boolean {
  return Boolean(error?.message && MESSAGES[error.message]);
}
