"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { logger } from "@/lib/logger";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { DELETE_PHRASE, isDeleteConfirmed, type DeleteState } from "./delete-account";
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

/**
 * Deletes the signed-in person's account through the delete-account Edge Function, which holds
 * the service role. The typed confirmation is checked here as well as in the form.
 */
export async function deleteAccount(
  _previous: DeleteState,
  formData: FormData,
): Promise<DeleteState> {
  if (!isDeleteConfirmed(formData.get("confirmation"))) {
    return { status: "error", message: `Type ${DELETE_PHRASE} to confirm.` };
  }

  const supabase = await createSupabaseServerClient();
  // Only forwarded: the function checks the token with the auth server before doing anything.
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) redirect("/sign-in?next=%2Fmore%2Faccount");

  const { url, publishableKey } = getSupabaseConfig();
  let deleted = false;
  try {
    const response = await fetch(`${url}/functions/v1/delete-account`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, apikey: publishableKey },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    deleted = response.ok;
    if (response.status === 409) {
      // Nothing was changed. Either they own a flat other people still live in, or money is open.
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (body?.error === "open_balance") {
        return {
          status: "error",
          message:
            "You still owe, or are owed, money in your flat, or have a payment waiting. Settle up first (Money), then delete your account.",
        };
      }
      return {
        status: "error",
        message:
          "You’re the owner of a flat with other people in it. Hand it over to someone else first (More, then Your flat), then delete your account.",
      };
    }
    if (!deleted) logger.error("account.delete_failed", { status: response.status });
  } catch (error) {
    logger.error("account.delete_unreachable", { error });
  }

  if (!deleted) {
    return {
      status: "error",
      message: "We couldn’t delete your account. Nothing has been lost. Please try again.",
    };
  }

  await endSession("local"); // clears this browser's cookies; the account itself is already gone
  redirect("/sign-in?deleted=1");
}
