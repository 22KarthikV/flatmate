const GENERAL = "We couldn’t save that. Please try again.";

const MESSAGES: Record<string, string> = {
  not_allowed: "You can’t do that to this report.",
  invalid_title: "Give the problem a short title of up to 80 characters.",
  invalid_details: "Keep the details to 500 characters.",
  invalid_location: "Keep the room to 40 characters.",
  invalid_note: "Write between 1 and 300 characters.",
  invalid_status: "Choose open, in progress or fixed.",
  too_many_open: "The flat has 50 open reports. Mark some as fixed first.",
  already_chasing: "Someone is already chasing this.",
  report_not_found: "We couldn’t find that report. It may have been removed.",
  not_a_member: "Choose someone who is still in the flat.",
};

/** A friendly sentence for what the database function said. */
export function fixErrorMessage(error: { code?: string; message?: string } | null): string {
  return (error?.message && MESSAGES[error.message]) || GENERAL;
}

/** True for the outcomes above, which are expected; anything else is worth logging. */
export function isExpectedFixError(error: { message?: string } | null): boolean {
  return Boolean(error?.message && MESSAGES[error.message]);
}
