const MAX_LENGTH = 2000;
const CONTROL_OR_BACKSLASH = /[\u0000-\u001f\u007f\\]/;
const AUTH_FLOW = /^\/(sign-in|auth)(\/|\?|$)/;

/**
 * Turns an untrusted `?next=` value into a path on this site, or the fallback.
 *
 * Only same-site paths survive: anything that could be read as another host (`//host`, `/\host`,
 * absolute URLs, encoded or double-encoded variants, dot-segment tricks), contains control
 * characters, is huge, or points back into the sign-in flow is replaced by `fallback`.
 */
export function safeNextPath(raw: unknown, fallback = "/dashboard"): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_LENGTH) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || CONTROL_OR_BACKSLASH.test(raw))
    return fallback;

  // Look at what the value means after one and two rounds of decoding, in case a later step
  // decodes it for us.
  let once: string;
  let twice: string;
  try {
    once = decodeURIComponent(raw);
    twice = decodeURIComponent(once);
  } catch {
    return fallback;
  }
  for (const decoded of [once, twice]) {
    if (decoded.startsWith("//") || CONTROL_OR_BACKSLASH.test(decoded)) return fallback;
  }

  let url: URL;
  try {
    url = new URL(raw, "http://localhost");
  } catch {
    return fallback;
  }
  // The URL parser resolves dot segments, so "/..//host" shows up here as "//host".
  if (url.origin !== "http://localhost" || url.pathname.startsWith("//")) return fallback;

  const path = url.pathname + url.search;
  return AUTH_FLOW.test(path) ? fallback : path;
}
