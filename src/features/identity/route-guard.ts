import { safeNextPath } from "./safe-redirect";

export type AccessDecision = { action: "allow" } | { action: "redirect"; to: string };

/** Pages anyone may open. Everything not listed here needs a session (deny by default). */
const PUBLIC_PATHS = new Set(["/", "/sign-in", "/privacy", "/terms", "/offline", "/design"]);
const PUBLIC_PREFIXES = ["/auth/"];

const isPublic = (pathname: string) =>
  PUBLIC_PATHS.has(pathname) || PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));

/**
 * Decides what to do with a page request. Pure, so every rule is unit tested.
 * `signedIn` must come from a verified session (`getClaims()`), never from a bare cookie.
 */
export function decideAccess({
  pathname,
  search,
  signedIn,
}: {
  pathname: string;
  search: string;
  signedIn: boolean;
}): AccessDecision {
  if (!signedIn) {
    if (isPublic(pathname)) return { action: "allow" };
    return { action: "redirect", to: `/sign-in?next=${encodeURIComponent(pathname + search)}` };
  }

  if (pathname === "/sign-in") {
    const next = new URLSearchParams(search).get("next");
    return { action: "redirect", to: safeNextPath(next) };
  }
  return { action: "allow" };
}
