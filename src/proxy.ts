import { NextResponse, type NextRequest } from "next/server";

import { decideAccess } from "@/features/identity/route-guard";
import { updateSession } from "@/lib/supabase/session";

/**
 * Refreshes the session, then enforces the route guard.
 *
 * Enforcement is switched on with AUTH_GUARD=on. It stays off until the end-to-end tests and
 * Lighthouse run as a signed-in user (identity Task 8), because they open signed-in pages
 * anonymously today. The guard logic itself is complete and tested.
 */
export async function proxy(request: NextRequest) {
  const { response, signedIn } = await updateSession(request);
  if (process.env.AUTH_GUARD !== "on") return response;

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
