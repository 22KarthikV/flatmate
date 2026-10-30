import "server-only";

import { getRequestSession } from "@/features/identity/session-claims";

/** The flat's reminder setting: days (3, 7 or 14), or null for never. Defaults to 7 if unreadable. */
export async function getNudgeInterval(householdId: string): Promise<number | null> {
  const { supabase } = await getRequestSession();
  const { data } = await supabase
    .from("households")
    .select("nudge_after_days")
    .eq("id", householdId)
    .maybeSingle();
  return data ? data.nudge_after_days : 7;
}
