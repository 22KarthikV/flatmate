import { KINDS, LABEL_MAX, NOTE_MAX, VALUE_MAX, unitOptions } from "./constants";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A meter or reading id from a URL or a form, or null when it is not a uuid. */
export function parseMeterId(value: unknown): string | null {
  return typeof value === "string" && UUID.test(value) ? value : null;
}

type Fail = { ok: false; message: string };
const fail = (message: string): Fail => ({ ok: false, message });

const DAY_MS = 86_400_000;
function dayNumber(iso: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const ms = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== iso) return null;
  return Math.round(ms / DAY_MS);
}

export interface MeterInput {
  kind: string;
  label: string | null;
  unit: string;
}

export function parseMeterFields(raw: {
  kind: string;
  label: string;
  unit: string;
}): { ok: true; value: MeterInput } | Fail {
  if (!KINDS.some((k) => k.id === raw.kind)) return fail("Choose gas, electricity or water.");
  if (!(unitOptions(raw.kind) as string[]).includes(raw.unit)) {
    return fail("Electricity is in kWh; gas and water can be kWh or m³.");
  }
  const label = raw.label.trim();
  if (label.length > LABEL_MAX) return fail(`Keep the label to ${LABEL_MAX} characters.`);
  return {
    ok: true,
    value: { kind: raw.kind, label: label === "" ? null : label, unit: raw.unit },
  };
}

export interface ReadingInput {
  readOn: string;
  value: number;
  note: string | null;
  isReset: boolean;
}

/** Checks a reading. `today` is yyyy-mm-dd in London; the date is not in the future, within a year. */
export function parseReadingFields(
  raw: { readOn: string; value: string; note: string; reset: boolean },
  today: string,
): { ok: true; value: ReadingInput } | Fail {
  const day = dayNumber(raw.readOn);
  const todayNumber = dayNumber(today);
  if (day === null || todayNumber === null) return fail("Choose the date of the reading.");
  if (day > todayNumber) return fail("The date can’t be in the future.");
  if (day < todayNumber - 365) return fail("The date can’t be more than a year ago.");

  const typed = raw.value.replace(/[,\s]/g, "");
  if (!/^\d+(\.\d{1,3})?$/.test(typed)) {
    return fail("Type the number on the meter, with up to three decimals.");
  }
  const value = Number(typed);
  if (value > VALUE_MAX) return fail("That number is too large.");

  const note = raw.note.trim();
  if (note.length > NOTE_MAX) return fail(`Keep the note to ${NOTE_MAX} characters.`);
  return {
    ok: true,
    value: { readOn: raw.readOn, value, note: note === "" ? null : note, isReset: raw.reset },
  };
}
