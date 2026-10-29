/** Invite tokens are 32 random bytes in URL-safe base64 (43 characters). */
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const JOIN_PATH = /^\/join\/([A-Za-z0-9_-]{43})\/?$/;

export const isInviteToken = (value: unknown): value is string =>
  typeof value === "string" && TOKEN.test(value);

export const buildInviteLink = (origin: string, token: string) => `${origin}/join/${token}`;

/**
 * Pulls the token out of whatever a person pasted: the full link, a path, or the bare token.
 * Returns null for anything else, so nothing unchecked ever reaches a redirect or the database.
 */
export function extractInviteToken(input: FormDataEntryValue | null): string | null {
  if (typeof input !== "string") return null;
  const text = input.trim();
  if (TOKEN.test(text)) return text;

  try {
    const path = text.startsWith("/") ? text : new URL(text).pathname;
    return JOIN_PATH.exec(path)?.[1] ?? null;
  } catch {
    return null;
  }
}
