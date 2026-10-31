import { DETAILS_MAX, LOCATION_MAX, NOTE_MAX, TITLE_MAX } from "./constants";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A report or person id from a URL or a form, or null when it is not a uuid. */
export function parseFixId(value: unknown): string | null {
  return typeof value === "string" && UUID.test(value) ? value : null;
}

type Fail = { ok: false; message: string };

export interface FixInput {
  title: string;
  details: string | null;
  location: string | null;
}

/** Checks the report form. The database checks again; this is for clear messages. */
export function parseFixFields(raw: {
  title: string;
  details: string;
  location: string;
}): { ok: true; value: FixInput } | Fail {
  const title = raw.title.trim();
  const details = raw.details.trim();
  const location = raw.location.trim();
  if (title === "") return { ok: false, message: "Say what is wrong, in a few words." };
  if (title.length > TITLE_MAX) {
    return { ok: false, message: `Keep the title to ${TITLE_MAX} characters or fewer.` };
  }
  if (details.length > DETAILS_MAX) {
    return { ok: false, message: `Keep the details to ${DETAILS_MAX} characters or fewer.` };
  }
  if (location.length > LOCATION_MAX) {
    return { ok: false, message: `Keep the room to ${LOCATION_MAX} characters or fewer.` };
  }
  return {
    ok: true,
    value: {
      title,
      details: details === "" ? null : details,
      location: location === "" ? null : location,
    },
  };
}

export function parseNote(raw: string): { ok: true; value: string } | Fail {
  const note = raw.trim();
  if (note === "") return { ok: false, message: "Write a note first." };
  if (note.length > NOTE_MAX) {
    return { ok: false, message: `Keep the note to ${NOTE_MAX} characters or fewer.` };
  }
  return { ok: true, value: note };
}
