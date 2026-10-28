import { logger } from "@/lib/logger";

import { safeNextPath } from "./safe-redirect";

export interface AuthCallbackDeps {
  /** Trades the one-time code from Google's redirect for a session (sets the auth cookies). */
  exchangeCodeForSession(code: string): Promise<{ error: unknown }>;
}

/**
 * Finishes the Google sign-in. Every failure ends on the same neutral error page: the person
 * never sees why, and nothing from the query string is echoed back.
 */
export async function handleAuthCallback(
  request: Request,
  { exchangeCodeForSession }: AuthCallbackDeps,
): Promise<Response> {
  const url = new URL(request.url);
  // Built on this request's own origin, so a crafted `next` can never leave the site.
  const redirectTo = (path: string) =>
    new Response(null, {
      status: 307,
      headers: {
        Location: new URL(path, url.origin).toString(),
        "Cache-Control": "private, no-store",
      },
    });

  const code = url.searchParams.get("code");
  if (url.searchParams.has("error") || !code) {
    logger.warn("auth.callback_rejected", { reason: url.searchParams.get("error") ?? "no_code" });
    return redirectTo("/auth/error");
  }

  try {
    const { error } = await exchangeCodeForSession(code);
    if (error) {
      logger.warn("auth.code_exchange_failed", { error });
      return redirectTo("/auth/error");
    }
  } catch (error) {
    logger.error("auth.code_exchange_threw", { error });
    return redirectTo("/auth/error");
  }

  return redirectTo(safeNextPath(url.searchParams.get("next")));
}
