import Link from "next/link";

import { Card, CardLabel } from "@/components/ui/card";
import { getMembership } from "@/features/household/membership";
import { getBalancesView } from "@/features/ledger/balances";

import { HomeBlock } from "./home-block";
import { moneyLine } from "./money-line";

async function loadMoney() {
  const membership = await getMembership();
  if (!membership) return null;
  // null from the ledger means "could not load": the block shows its error line, never "All square".
  const view = await getBalancesView(membership.householdId, membership.profileId);
  return view ? moneyLine(view) : null;
}

export function MoneyLine({ line }: { line: { text: string; people: string[] } }) {
  return (
    <Link
      href="/money"
      className="flex min-h-11 flex-col justify-center underline-offset-4 hover:underline"
    >
      <span className="text-lg">{line.text}</span>
      {line.people.length > 0 ? (
        <span className="text-muted text-sm">With {line.people.join(", ")}</span>
      ) : null}
    </Link>
  );
}

/** One line: whether the viewer owes or is owed, and with whom. */
export function MoneySummary() {
  return (
    <Card aria-labelledby="home-money">
      <CardLabel id="home-money">Money</CardLabel>
      <div className="mt-3">
        <HomeBlock name="money" load={loadMoney} height="min-h-16">
          {(line) => <MoneyLine line={line} />}
        </HomeBlock>
      </div>
    </Card>
  );
}
