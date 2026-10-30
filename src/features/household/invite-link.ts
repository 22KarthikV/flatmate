/** Invite tokens are 32 random bytes in URL-safe base64 (43 characters). */
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
// Found anywhere in pasted text. The token must stand alone: not followed by more token
// characters, and not by a further path segment such as `/extra`.
const JOIN_PATH = /\/join\/([A-Za-z0-9_-]{43})(?![A-Za-z0-9_-])(?!\/[A-Za-z0-9_-])/;

export const isInviteToken = (value: unknown): value is string =>
  typeof value === "string" && TOKEN.test(value);

export const buildInviteLink = (origin: string, token: string) => `${origin}/join/${token}`;

/** What the share sheet sends alongside the link: a warm title and a line on why to join. */
export function buildInviteMessage(flatName: string): { title: string; text: string } {
  const flat = flatName.trim() || "our flat";
  return {
    title: `Join ${flat} on FlatMate`,
    text: `Good news: you've been chosen for ${flat} on FlatMate. Bad news: you're on the bins rota now. Rotas, rent, bills and plans all live there, so no more passive-aggressive notes on the fridge. Tap the link, sign in with Google and you're in:`,
  };
}

/**
 * Pulls the token out of whatever a person pasted: the full link, a path, the bare token, or a
 * shared message with the link inside it ("Join our flat on FlatMate https://…/join/<token>").
 * Returns null for anything else, so nothing unchecked ever reaches a redirect or the database.
 */
export function extractInviteToken(input: FormDataEntryValue | null): string | null {
  if (typeof input !== "string") return null;
  const text = input.trim();
  if (TOKEN.test(text)) return text;
  return JOIN_PATH.exec(text)?.[1] ?? null;
}
