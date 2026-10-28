const HOST = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?$/i;
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

const first = (value: string | null) => value?.split(",")[0]?.trim() ?? "";

/**
 * Works out the public address of this deployment from the request headers, so the same code
 * serves localhost, preview deployments and production. Returns null for anything that does
 * not look like a plain host. The result is only ever used as a redirect *request*: Supabase
 * still checks it against its redirect allow-list.
 */
export function originFromHeaders(headers: Headers): string | null {
  const host = first(headers.get("x-forwarded-host")) || first(headers.get("host"));
  if (!HOST.test(host)) return null;

  const forwarded = first(headers.get("x-forwarded-proto")).toLowerCase();
  const protocol = LOCAL.test(host) ? "http" : forwarded === "http" ? "http" : "https";
  return `${protocol}://${host}`;
}
