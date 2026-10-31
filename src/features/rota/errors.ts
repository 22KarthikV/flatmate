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
  assignment_not_found: "We couldn’t find that chore.",
  assignment_superseded:
    "The rota was rebuilt, so that chore has moved. Refresh to see the new one.",
  has_checklist: "Tick the steps to finish this chore.",
  not_completed: "That chore isn’t finished yet.",
  no_signoff_needed: "That chore doesn’t need a sign-off.",
  assignee_unavailable: "Someone is away on the day they were given a chore.",
  week_too_far: "That week is too far ahead.",
  week_in_past: "That week has already finished.",
  invalid_reason: "We couldn’t do that.",
  invalid_assignment: "The rota had a problem, so nothing was saved.",
  invalid_date: "A chore had a date outside its week.",
  not_a_member: "Someone is no longer in the flat.",
  already_completed: "That chore is already finished.",
  invalid_recipient: "Choose a different flatmate.",
  swap_pending: "There is already an open swap request for that chore.",
  invalid_exchange: "The chore offered in return is no longer theirs to swap.",
  swap_not_found: "We couldn’t find that swap request.",
  swap_not_pending: "That swap request has already been answered.",
  away_overlap:
    "That overlaps dates you already have marked as away. End or shorten that one first.",
  away_in_past: "An away period can start no earlier than this week.",
  invalid_dates: "Choose an end date on or after the start date.",
  invalid_note: "Keep the note to 100 characters.",
  away_not_found: "We couldn\u2019t find that away period.",
  undo_expired:
    "It is more than 24 hours since the chores were moved, so it can no longer be undone.",
  nothing_to_undo: "There is nothing to undo.",
  not_overdue: "That chore isn’t overdue, or it has already been sorted out.",
  cannot_cover: "Only this week’s turn of the same chore, with the same person, can cover it.",
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
