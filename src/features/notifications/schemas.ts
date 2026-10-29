const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A notification id from a form, or null when it is not a uuid. */
export function parseNotificationId(value: unknown): string | null {
  return typeof value === "string" && UUID.test(value) ? value : null;
}

/** True for a path inside this app. Anything else (other sites, protocol-relative) is refused. */
export function isSafeInternalPath(value: string): boolean {
  return /^\/([^/\\]|$)/.test(value);
}
