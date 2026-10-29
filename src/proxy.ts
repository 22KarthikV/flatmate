import { NextResponse, type NextRequest } from "next/server";

import { decideAccess } from "@/features/identity/route-guard";
import { updateSession } from "@/lib/supabase/session";

/**
 * Refreshes the session, then enforces the route guard.
 *
 * Enforcement is on unless AUTH_GUARD=off, so a missing setting can never leave the app open.
 * The (app) layout checks the session again as a second line of defence.
 */
export async function proxy(request: NextRequest) {
  const { response, signedIn } = await updateSession(request);
  if (process.env.AUTH_GUARD === "off") return response;

  const { pathname, search } = request.nextUrl;
  const decision = decideAccess({ pathname, search, signedIn });
  if (decision.action === "allow") return response;

  const redirect = NextResponse.redirect(new URL(decision.to, request.url));
  // Keep any refreshed session cookies, and never let a CDN cache a per-person redirect.
  for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
  redirect.headers.set("Cache-Control", "private, no-store");
  return redirect;
}

export const config = {
  // Pages only. Skip build assets, icons, the manifest, the service worker and the health check.
  matcher: [
    "/((?!_next/static|_next/image|icons/|api/health|manifest\\.webmanifest|sw\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
