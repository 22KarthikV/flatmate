"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { logger } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { originFromHeaders } from "./origin";
import { parseDisplayName } from "./profile";
import type { RenameState } from "./profile-constants";
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

/** Renames the signed-in person. RLS allows only their own row and only this column. */
export async function updateDisplayName(
  _previous: RenameState,
  formData: FormData,
): Promise<RenameState> {
  const parsed = parseDisplayName(formData.get("displayName"));
  if (!parsed.ok) return { status: "error", message: parsed.error };

  const supabase = await createSupabaseServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) redirect("/sign-in?next=%2Fmore%2Faccount");

  const { data, error } = await supabase
    .from("profiles")
    .update({ display_name: parsed.value })
    .eq("user_id", userId)
    .select("id");

  if (error || !data?.length) {
    logger.error("profile.rename_failed", { error });
    return { status: "error", message: "We couldn’t save that. Please try again." };
  }

  revalidatePath("/more/account");
  return { status: "saved", message: "Saved." };
}

/** Ends the session on this device only. */
export async function signOut(): Promise<never> {
  await endSession("local");
  redirect("/sign-in");
}

/** Ends every session, on every device. Other devices lose access when their short-lived token next refreshes. */
export async function signOutEverywhere(): Promise<never> {
  await endSession("global");
  redirect("/sign-in");
}

async function endSession(scope: "local" | "global") {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signOut({ scope });
  // Never trap someone in a session: log it and carry on to the sign-in page.
  if (error) logger.error("auth.sign_out_failed", { scope, error });
}
