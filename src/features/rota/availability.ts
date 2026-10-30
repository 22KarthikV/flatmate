import "server-only";

import { getRequestSession } from "@/features/identity/session-claims";

import type { AvailabilityRow } from "./availability-summary";
import { addDays } from "./week";

/** Everyone's availability for one week. Row-level security limits it to the caller's flat. */
export async function getWeekAvailability(weekStart: string): Promise<AvailabilityRow[]> {
  const { supabase } = await getRequestSession();
  const { data } = await supabase
    .from("availability")
    .select("profile_id, on_date, available, assumed")
    .gte("on_date", weekStart)
    .lte("on_date", addDays(weekStart, 6));

  return (data ?? []).map((row) => ({
    profileId: row.profile_id,
    onDate: row.on_date,
    available: row.available,
    assumed: row.assumed,
  }));
}
