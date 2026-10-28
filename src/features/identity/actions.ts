"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { logger } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { originFromHeaders } from "./origin";
import { safeNextPath } from "./safe-redirect";

/**
 * Starts Google sign-in. Runs on the server so the PKCE verifier cookie is set before the
 * person leaves for Google, and the page works without any client-side JavaScript.
 */
export async function signInWithGoogle(formData: FormData): Promise<never> {
  const next = safeNextPath(formData.get("next"));
  const origin = originFromHeaders(await headers());
  if (!origin) redirect("/auth/error");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      skipBrowserRedirect: true,
      // Let people on a shared phone pick the right Google account.
      queryParams: { prompt: "select_account" },
    },
  });

  if (error || !data.url) {
    logger.error("auth.sign_in_start_failed", { error });
    redirect("/auth/error");
  }
  redirect(data.url);
}
