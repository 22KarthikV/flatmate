// Kept free of server-only imports. The form and the server action read a bin the same way; the
// database checks it again, so this is for clear messages, not for trust.

import { BIN_NAME_MAX, COLOURS, NOTE_MAX } from "./constants";
import { addDays, dayNumber } from "./collections";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A bin or exception id from a URL or a form, or null when it is not a uuid. */
export function parseBinId(value: unknown): string | null {
  return typeof value === "string" && UUID.test(value) ? value : null;
}

function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    return false;
  }
  return addDays(value, 0) === value;
}

type Fail = { ok: false; message: string };
const fail = (message: string): Fail => ({ ok: false, message });

export interface BinInput {
  name: string;
  colour: string;
  anchorOn: string;
  everyWeeks: number;
}

export function parseBinFields(
  raw: { name: string; colour: string; anchorOn: string; everyWeeks: string },
  today: string,
): { ok: true; value: BinInput } | Fail {
  const name = raw.name.trim();
  if (name === "") return fail("Give the bin a name, like “Grey bin”.");
  if (name.length > BIN_NAME_MAX) return fail(`Keep the name to ${BIN_NAME_MAX} characters.`);
  if (!COLOURS.some((c) => c.id === raw.colour)) return fail("Choose a colour.");
  const everyWeeks = Number(raw.everyWeeks);
  if (!Number.isInteger(everyWeeks) || everyWeeks < 1 || everyWeeks > 4) {
    return fail("Choose how often it is collected.");
  }
  if (!isRealDate(raw.anchorOn)) return fail("Choose a date it was collected.");
  if (Math.abs(dayNumber(raw.anchorOn) - dayNumber(today)) > 730) {
    return fail("Choose a date within two years of today.");
  }
  return { ok: true, value: { name, colour: raw.colour, anchorOn: raw.anchorOn, everyWeeks } };
}

export interface ExceptionInput {
  streamId: string;
  originalOn: string;
  kind: "skip" | "move";
  movedTo: string | null;
  note: string | null;
}

export function parseExceptionFields(raw: {
  streamId: string;
  originalOn: string;
  kind: string;
  movedTo: string;
  note: string;
}): { ok: true; value: ExceptionInput } | Fail {
  const streamId = parseBinId(raw.streamId);
  if (!streamId) return fail("We couldn’t find that bin.");
  if (!isRealDate(raw.originalOn)) return fail("Choose the collection date.");
  if (raw.kind !== "skip" && raw.kind !== "move") return fail("Choose skip or move.");
  const note = raw.note.trim();
  if (note.length > NOTE_MAX) return fail(`Keep the note to ${NOTE_MAX} characters.`);

  let movedTo: string | null = null;
  if (raw.kind === "move") {
    if (!isRealDate(raw.movedTo)) return fail("Choose the day it moves to.");
    const gap = Math.abs(dayNumber(raw.movedTo) - dayNumber(raw.originalOn));
    if (gap === 0 || gap > 14) return fail("It must move to a different day, within 14 days.");
    movedTo = raw.movedTo;
  }
  return {
    ok: true,
    value: {
      streamId,
      originalOn: raw.originalOn,
      kind: raw.kind,
      movedTo,
      note: note === "" ? null : note,
    },
  };
}
