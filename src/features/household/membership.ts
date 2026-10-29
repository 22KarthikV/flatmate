import "server-only";

import { cache } from "react";

import { getRequestSession } from "@/features/identity/session-claims";

import type { HouseholdRole } from "./constants";

export interface Membership {
  householdId: string;
  householdName: string;
  role: HouseholdRole;
  /** The signed-in person's own profile id. */
  profileId: string;
}

/**
 * The signed-in person's active flat and role, or null when they have none. One query, shared by
 * everything in the request. Row-level security limits it to flats they belong to, and a closed
 * flat comes back without its household row, so it counts as no flat.
 */
export const getMembership = cache(async (): Promise<Membership | null> => {
  const { supabase, claims } = await getRequestSession();
  if (!claims?.sub) return null;

  const { data, error } = await supabase
    .from("memberships")
    .select("role, household:households(id, name), profile:profiles!inner(id, user_id)")
    .eq("profile.user_id", claims.sub)
    .is("left_at", null)
    .maybeSingle();

  if (error || !data?.household) return null;
  return {
    householdId: data.household.id,
    householdName: data.household.name,
    role: data.role,
    profileId: data.profile.id,
  };
});
