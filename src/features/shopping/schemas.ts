import { ITEM_NAME_MAX, ITEM_NOTE_MAX, MAX_BUY_ITEMS } from "./constants";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An item id from a URL or a form, or null when it is not a uuid. */
export function parseItemId(value: unknown): string | null {
  return typeof value === "string" && UUID.test(value) ? value : null;
}

/** Item ids from a comma separated string, once each. Anything malformed, or too many, gives none. */
export function parseItemIds(value: unknown): string[] {
  if (typeof value !== "string" || value === "") return [];
  const ids = value.split(",");
  if (!ids.every((id) => UUID.test(id))) return [];
  const unique = [...new Set(ids)];
  return unique.length > MAX_BUY_ITEMS ? [] : unique;
}

export type ParsedItem =
  { ok: true; value: { name: string; note: string | null } } | { ok: false; message: string };

/** Checks the add box. The database checks again. */
export function parseItemFields(name: unknown, note: unknown): ParsedItem {
  const cleanName = typeof name === "string" ? name.trim() : "";
  const cleanNote = typeof note === "string" ? note.trim() : "";
  if (cleanName === "") return { ok: false, message: "Type what the flat needs." };
  if (cleanName.length > ITEM_NAME_MAX) {
    return { ok: false, message: `Keep the name to ${ITEM_NAME_MAX} characters or fewer.` };
  }
  if (cleanNote.length > ITEM_NOTE_MAX) {
    return { ok: false, message: `Keep the note to ${ITEM_NOTE_MAX} characters or fewer.` };
  }
  return { ok: true, value: { name: cleanName, note: cleanNote === "" ? null : cleanNote } };
}
