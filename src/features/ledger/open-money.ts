import "server-only";

import { getBalancesView } from "./balances";
import { getPendingSettlements } from "./settlements";

/**
 * Whether the signed-in person has money open in their flat: a balance either way, or a payment
 * waiting for a decision. It is what stops them leaving or deleting their account; the database
 * enforces that, and this only lets the screen say why before they try.
 */
export async function hasOpenMoney(householdId: string, viewerId: string): Promise<boolean> {
  const [view, pending] = await Promise.all([
    getBalancesView(householdId, viewerId),
    getPendingSettlements(viewerId, false),
  ]);
  const owesOrOwed = view !== null && view.summary.kind !== "square";
  return owesOrOwed || pending.toConfirm.length > 0 || pending.sent.length > 0;
}
