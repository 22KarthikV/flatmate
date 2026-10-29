import "server-only";

import { getRequestSession } from "@/features/identity/session-claims";

import type { HouseholdRole } from "./constants";

export interface Member {
  profileId: string;
  displayName: string;
  avatarUrl: string | null;
  role: HouseholdRole;
}

const ROLE_ORDER: Record<HouseholdRole, number> = { owner: 0, admin: 1, member: 2 };

/** Everyone currently in the caller's flat: owner first, then admins, then members by join date. */
export async function getMembers(): Promise<Member[]> {
  const { supabase } = await getRequestSession();
  const { data } = await supabase
    .from("memberships")
    .select("role, joined_at, profile:profiles(id, display_name, avatar_url)")
    .is("left_at", null)
    .order("joined_at", { ascending: true });

  return (data ?? [])
    .flatMap((row) =>
      row.profile
        ? [
            {
              profileId: row.profile.id,
              displayName: row.profile.display_name,
              avatarUrl: row.profile.avatar_url,
              role: row.role,
              joinedAt: row.joined_at,
            },
          ]
        : [],
    )
    .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.joinedAt.localeCompare(b.joinedAt))
    .map(({ joinedAt: _joinedAt, ...member }) => {
      void _joinedAt;
      return member;
    });
}
