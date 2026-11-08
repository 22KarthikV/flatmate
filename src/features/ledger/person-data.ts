import "server-only";

import { getRequestSession } from "@/features/identity/session-claims";
import { logger } from "@/lib/logger";

import { getBalancesView } from "./balances";
import type { PersonRow, SuggestedPayment } from "./balance-view";
import { paymentsFor, toLedgerItems, type LedgerItem } from "./person-ledger";

export interface PersonLedgerView {
  person: PersonRow;
  items: LedgerItem[];
  /** The suggested payments that involve this person. */
  payments: SuggestedPayment[];
  /** The balances did not add up, so payments are withheld. */
  inconsistent: boolean;
}

/**
 * The items behind one flatmate's balance, with the same position and suggested payments the Money
 * screen shows. Null when the person is not in this flat, or the numbers could not be loaded.
 */
export async function getPersonLedger(
  householdId: string,
  viewerId: string,
  personId: string,
): Promise<PersonLedgerView | null> {
  const { supabase } = await getRequestSession();
  const [balances, ledger] = await Promise.all([
    getBalancesView(householdId, viewerId),
    supabase.rpc("person_ledger", { p_person: personId }),
  ]);
  if (!balances) return null;
  if (ledger.error || !ledger.data) {
    logger.error("ledger.person_failed", { error: ledger.error });
    return null;
  }

  const person = [...balances.people, ...balances.former].find((row) => row.profileId === personId);
  if (!person) return null;

  return {
    person,
    items: toLedgerItems(ledger.data),
    payments: paymentsFor(balances.payments, personId),
    inconsistent: balances.inconsistent,
  };
}
