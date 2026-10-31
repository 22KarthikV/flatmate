const GENERAL = "We couldn’t do that. Please try again.";

// What the events database functions say, in plain words. Every message they raise is listed here.
const MESSAGES: Record<string, string> = {
  not_signed_in: "Please sign in again.",
  not_a_member: "You need to be in a flat to do that.",
  event_not_found: "We couldn’t find that event.",
  not_allowed: "Only the organiser can do that.",
  event_not_open: "Voting on that event has finished.",
  voting_closed: "Voting on that event has just closed.",
  invalid_title: "Give the event a title of up to 80 characters.",
  invalid_description: "Use 500 characters or fewer for the description.",
  invalid_location: "Use 100 characters or fewer for the place.",
  invalid_options: "Offer 2 to 8 different dates, and check any end time comes after its start.",
  option_in_past: "Every date must be in the future.",
  invalid_deadline: "Voting must close in the future, before the first date.",
  deadline_locked: "The voting deadline can only change while voting is open.",
  too_many_open_events: "Your flat already has 10 events being decided. Finish one first.",
  too_many_options: "An event can have up to 8 dates.",
  too_few_options: "An event needs at least two dates, so that one can’t be dropped.",
  invalid_option: "That date can’t be picked.",
  invalid_answer: "Choose yes, maybe or no.",
  invalid_reason: "Keep the reason to 100 characters.",
};

/** A friendly sentence for what the database function said, or a general one for anything unexpected. */
export function eventErrorMessage(error: { code?: string; message?: string } | null): string {
  return (error?.message && MESSAGES[error.message]) || GENERAL;
}

/** True for the outcomes above, which are expected; anything else is worth logging. */
export function isExpectedEventError(error: { message?: string } | null): boolean {
  return Boolean(error?.message && MESSAGES[error.message]);
}

export const EVENT_ERROR_CODES = Object.keys(MESSAGES);
