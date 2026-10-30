import "server-only";

import { getRequestSession } from "@/features/identity/session-claims";

export interface AwayPeriod {
  id: string;
  profileId: string;
  name: string;
  startsOn: string;
  endsOn: string;
  note: string | null;
}

/** Away periods in the flat that have not finished, soonest first (row-level security limits them to the flat). */
export async function getAwayPeriods(today: string): Promise<AwayPeriod[]> {
  const { supabase } = await getRequestSession();
  const { data } = await supabase
    .from("away_periods")
    .select(
      "id, profile_id, starts_on, ends_on, note, person:profiles!away_periods_profile_id_fkey(display_name)",
    )
    .is("ended_at", null)
    .gte("ends_on", today)
    .order("starts_on");

  return (data ?? []).map((row) => ({
    id: row.id,
    profileId: row.profile_id,
    name: row.person?.display_name ?? "Someone",
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    note: row.note,
  }));
}
