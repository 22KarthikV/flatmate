const GENERAL = "We couldn’t save that. Please try again.";

const MESSAGES: Record<string, string> = {
  not_allowed: "Only an owner or admin can change the chores.",
  invalid_chore: "Check the name, how often it happens and the day.",
  invalid_effort: "Choose an effort from 1 to 5.",
  invalid_checklist: "Each step needs 1 to 80 characters, and a chore can have up to 20 steps.",
  duplicate_name: "Another chore already has that name.",
  too_many_chores: "A flat can have up to 12 chores. Archive one first.",
  chore_not_found: "We couldn’t find that chore.",
  chore_archived: "That chore has been archived.",
  chores_exist: "Your flat already has chores.",
  window_closed: "The deadline for that week has passed, so your answers can no longer change.",
  window_not_open: "That week is not open for answers yet.",
  invalid_week: "We couldn’t tell which week that was.",
  invalid_days: "Please answer for all seven days.",
};

/** A friendly sentence for what the database function said, or a general one for anything unexpected. */
export function rotaErrorMessage(error: { code?: string; message?: string } | null): string {
  return (error?.message && MESSAGES[error.message]) || GENERAL;
}

/** True for the outcomes above, which are expected; anything else is worth logging. */
export function isExpectedRotaError(error: { message?: string } | null): boolean {
  return Boolean(error?.message && MESSAGES[error.message]);
}
