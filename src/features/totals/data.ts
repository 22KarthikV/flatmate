import "server-only";

import { getRequestSession } from "@/features/identity/session-claims";
import { getBalancesView } from "@/features/ledger/balances";
import { getMyRent } from "@/features/recurring/rent";

import { buildTotals, type RentIOwe, type RentOwedToMe, type Totals } from "./totals";

/**
 * What the signed-in person owes and is owed, rent and bills and expenses together. Rent comes from
 * two functions that each derive the person from their sign-in, so this can show only their own
 * rent and the rent they collect. Returns null if the shared balances could not be loaded.
 */
export async function getTotals(householdId: string, viewerId: string): Promise<Totals | null> {
  const { supabase } = await getRequestSession();
  const [balances, myRent, owedToMe] = await Promise.all([
    getBalancesView(householdId, viewerId),
    getMyRent(),
    supabase.rpc("rent_owed_to_me"),
  ]);
  if (!balances) return null;

  const byCollector = new Map<string, RentIOwe>();
  for (const row of myRent) {
    const entry = byCollector.get(row.collectorId) ?? {
      collectorId: row.collectorId,
      collectorName: row.collectorName,
      outstandingPence: 0,
      pendingPence: 0,
    };
    entry.outstandingPence += row.outstandingPence;
    entry.pendingPence += row.pendingPence;
    byCollector.set(row.collectorId, entry);
  }

  const rentOwedToMe: RentOwedToMe[] = (owedToMe.data ?? []).map((row) => ({
    payerId: row.payer_id,
    payerName: row.payer_name,
    outstandingPence: row.outstanding_pence,
    pendingPence: row.pending_pence,
  }));

  return buildTotals({
    payments: balances.payments,
    rentIOwe: [...byCollector.values()],
    rentOwedToMe,
  });
}
