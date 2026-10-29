import "server-only";

import { getRequestSession } from "./session-claims";

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
  const { supabase, claims } = await getRequestSession();
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
