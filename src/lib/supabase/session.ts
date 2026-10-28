import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { Database } from "@/lib/db/types";
import { logger } from "@/lib/logger";

import { getSupabaseConfig } from "./config";

/** Supabase auth cookies are named sb-<project-ref>-auth-token, split into .0, .1 when large. */
export function hasAuthCookie(cookies: readonly { name: string }[]): boolean {
  return cookies.some((cookie) => /^sb-.+-auth-token(\.\d+)?$/.test(cookie.name));
}

export interface SessionResult {
  response: NextResponse;
  /** True only when the session verified (`getClaims()`), never just because a cookie exists. */
  signedIn: boolean;
}

/**
 * Keeps a signed-in user's session fresh and reports whether the visitor is signed in.
 * Run from `proxy.ts` on every page request.
 *
 * Anonymous visitors (no auth cookie) cost nothing: no client is created and no network call
 * is made. A failure to reach Supabase never takes the site down; the request carries on, the
 * visitor counts as signed out (fail closed), and the next request retries.
 */
export async function updateSession(request: NextRequest): Promise<SessionResult> {
  let response = NextResponse.next({ request });
  if (!hasAuthCookie(request.cookies.getAll())) return { response, signedIn: false };

  const { url, publishableKey } = getSupabaseConfig();

  const supabase = createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        // Responses that set auth cookies must never be cached by a CDN.
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    },
  });

  let signedIn = false;
  try {
    // Must run before the response is produced so a refreshed token can be written to cookies.
    const { data } = await supabase.auth.getClaims();
    signedIn = Boolean(data?.claims?.sub);
  } catch (error) {
    logger.warn("auth.session_refresh_failed", { error });
  }

  return { response, signedIn };
}
