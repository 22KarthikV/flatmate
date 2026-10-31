const GENERAL = "We couldn’t save that. Please try again.";

const MESSAGES: Record<string, string> = {
  not_allowed: "Only an owner or admin can do that.",
  invalid_kind: "Choose gas, electricity or water.",
  invalid_unit: "Electricity is in kWh; gas and water can be kWh or m³.",
  invalid_label: "Keep the label to 30 characters.",
  invalid_date: "Choose a date that is not in the future and within the last year.",
  invalid_value: "Type a reading between 0 and 9,999,999.999.",
  invalid_note: "Keep the note to 100 characters.",
  already_recorded: "There is already a reading for that day. Cancel it first to enter a new one.",
  lower_than_previous: "That is lower than the last reading.",
  higher_than_later: "That is higher than a later reading.",
  meter_has_readings: "A meter with readings can only change its label.",
  too_many_meters: "A flat can have up to 10 meters. Remove one first.",
  meter_not_found: "We couldn’t find that meter.",
  reading_not_found: "We couldn’t find that reading. It may already be cancelled.",
};

/** A friendly sentence for what the database function said. */
export function meterErrorMessage(error: { code?: string; message?: string } | null): string {
  return (error?.message && MESSAGES[error.message]) || GENERAL;
}

/** True for the outcomes above, which are expected; anything else is worth logging. */
export function isExpectedMeterError(error: { message?: string } | null): boolean {
  return Boolean(error?.message && MESSAGES[error.message]);
}
