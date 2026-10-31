import { EXPIRY_CHOICES, POST_MAX } from "./constants";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A post id from a form, or null when it is not a uuid. */
export function parsePostId(value: unknown): string | null {
  return typeof value === "string" && UUID.test(value) ? value : null;
}

export interface PostInput {
  body: string;
  days: number;
  pin: boolean;
}

/** Checks the post box. The database checks again; this is for clear messages. */
export function parsePostFields(
  raw: { body: string; days: string; pin: boolean },
  isAdmin: boolean,
): { ok: true; value: PostInput } | { ok: false; message: string } {
  const body = raw.body.trim();
  if (body === "") return { ok: false, message: "Write something to post." };
  if (body.length > POST_MAX) {
    return { ok: false, message: `Keep it to ${POST_MAX} characters or fewer.` };
  }
  if (raw.pin && !isAdmin) return { ok: false, message: "Only an owner or admin can pin a post." };

  const days = Number(raw.days);
  if (!raw.pin && !EXPIRY_CHOICES.some((choice) => choice.days === days)) {
    return { ok: false, message: "Choose how long it stays up." };
  }
  return { ok: true, value: { body, days: raw.pin ? 7 : days, pin: raw.pin } };
}
