import "server-only";

import { connection } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface CurrentProfile {
  displayName: string;
  avatarUrl: string | null;
  email: string | null;
}

/**
 * The signed-in person's profile, or null when nobody is signed in. Identity comes from the
 * verified claims; the profile row is read through RLS, so it can only ever be their own.
 */
export async function getCurrentProfile(): Promise<CurrentProfile | null> {
  // Request time only: the Supabase client reads the clock on start-up, which Next forbids
  // while it prerenders or prefetches.
  await connection();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, avatar_url")
    .eq("user_id", claims.sub)
    .maybeSingle();
  if (!profile) return null;

  return {
    displayName: profile.display_name,
    avatarUrl: profile.avatar_url,
    email: typeof claims.email === "string" ? claims.email : null,
  };
}
