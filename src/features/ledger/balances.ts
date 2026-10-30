import "server-only";

import { getMembers } from "@/features/household/members";
import { getRequestSession } from "@/features/identity/session-claims";
import { logger } from "@/lib/logger";

import { buildBalancesView, type BalancesView } from "./balance-view";

/**
 * Where everyone in the flat stands, worked out by the database from the live rows every time, so
 * it cannot drift. Names come from the profiles flatmates are allowed to see, past members
 * included. Returns null if the balances could not be loaded.
 */
export async function getBalancesView(
  householdId: string,
  viewerId: string,
): Promise<BalancesView | null> {
  const { supabase } = await getRequestSession();
  const { data: rows, error } = await supabase.rpc("household_balances", {
    p_household_id: householdId,
  });
  if (error || !rows) {
    logger.error("ledger.balances_failed", { error });
    return null;
  }

  const [{ data: profiles }, members] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, display_name")
      .in(
        "id",
        rows.map((row) => row.profile_id),
      ),
    getMembers(),
  ]);

  const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.display_name]));
  const current = new Set(members.map((member) => member.profileId));

  return buildBalancesView(
    rows.map((row) => ({
      profileId: row.profile_id,
      displayName: names.get(row.profile_id) ?? "Someone",
      pence: row.balance_pence,
      current: current.has(row.profile_id),
    })),
    viewerId,
  );
}
