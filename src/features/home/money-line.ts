// Pure: the one-line "what you owe / are owed" and who it is with.

import type { BalancesView } from "@/features/ledger/balance-view";
import { formatPence } from "@/features/ledger/money";

export const MONEY_PEOPLE_CAP = 3;

export function moneyLine(view: BalancesView): { text: string; people: string[] } {
  const { kind, pence } = view.summary;
  const names = view.payments
    .filter((p) => p.involvesYou)
    .map((p) => (p.youPay ? p.toName : p.fromName));
  const people = [...new Set(names)].slice(0, MONEY_PEOPLE_CAP);
  if (kind === "owes") return { text: `You owe ${formatPence(pence)} in total`, people };
  if (kind === "owed") return { text: `You're owed ${formatPence(pence)}`, people };
  return { text: "All square", people: [] };
}
