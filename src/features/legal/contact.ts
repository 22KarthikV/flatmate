const ISSUES_URL = "https://github.com/22KarthikV/flatmate/issues";

export type Contact = { kind: "email"; email: string } | { kind: "issues"; url: string };

/**
 * How to reach the person who runs FlatMate. An email address is shown only when one has been
 * configured (NEXT_PUBLIC_CONTACT_EMAIL); until then the public issue tracker is the fallback.
 */
export function resolveContact(email: string | undefined): Contact {
  const trimmed = email?.trim();
  if (trimmed && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed))
    return { kind: "email", email: trimmed };
  return { kind: "issues", url: ISSUES_URL };
}

export const LAST_UPDATED = "29 October 2026";
