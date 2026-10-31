const GENERAL = "We couldn’t save that. Please try again.";

const MESSAGES: Record<string, string> = {
  not_allowed: "Only an owner or admin can change the bins.",
  invalid_name: "Give the bin a name of up to 40 characters.",
  invalid_colour: "Choose one of the colours.",
  invalid_pattern: "Choose how often it is collected, from every week to every 4 weeks.",
  invalid_date: "Choose a real collection date within two years of today.",
  invalid_exception: "A moved collection must land on a different day, within 14 days.",
  invalid_note: "Keep the note to 60 characters.",
  too_many_bins: "A flat can have up to 20 bins. Remove one first.",
  bin_not_found: "We couldn’t find that bin.",
  exception_not_found: "We couldn’t find that change.",
  not_a_collection_day: "That isn’t one of this bin’s collection days.",
};

/** A friendly sentence for what the database function said. */
export function binErrorMessage(error: { code?: string; message?: string } | null): string {
  return (error?.message && MESSAGES[error.message]) || GENERAL;
}

/** True for the outcomes above, which are expected; anything else is worth logging. */
export function isExpectedBinError(error: { message?: string } | null): boolean {
  return Boolean(error?.message && MESSAGES[error.message]);
}
