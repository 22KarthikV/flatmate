import Link from "next/link";
import { Suspense } from "react";

import { Card, CardLabel } from "@/components/ui/card";
import { RequireFlat } from "@/features/household/require-flat";
import { getMembership } from "@/features/household/membership";
import { BalancesCard } from "@/features/ledger/balances-card";
import { getBalancesView } from "@/features/ledger/balances";
import { ExpenseList } from "@/features/ledger/expense-list";
import { getRecentExpenses } from "@/features/ledger/expenses";
import { PendingSettlementsCard } from "@/features/ledger/pending-settlements";
import { getPendingSettlements } from "@/features/ledger/settlements";

export const metadata = { title: "Money | FlatMate" };

async function MoneyContent() {
  const membership = await getMembership();
  if (!membership) return null;
  const [expenses, balances, pending] = await Promise.all([
    getRecentExpenses(membership.profileId),
    getBalancesView(membership.householdId, membership.profileId),
    getPendingSettlements(
      membership.profileId,
      membership.role === "owner" || membership.role === "admin",
    ),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-8">
      <header className="flex flex-col gap-2">
        <p className="label-caps text-muted">Rent, bills and expenses</p>
        <h1 className="font-display text-5xl sm:text-6xl">Money</h1>
        <p className="text-muted max-w-md">Shared expenses for {membership.householdName}.</p>
      </header>

      <div className="flex gap-2">
        <Link
          href="/money/add"
          className="label-caps bg-ink text-paper inline-flex min-h-11 min-w-0 flex-1 items-center justify-center px-3 text-center hover:opacity-85"
        >
          Add expense
        </Link>
        <Link
          href="/money/settle"
          className="label-caps border-ink hover:bg-ink hover:text-paper inline-flex min-h-11 min-w-0 flex-1 items-center justify-center border px-3 text-center"
        >
          Record a payment
        </Link>
        <Link
          href="/money/history"
          aria-label="History"
          title="History"
          className="border-ink hover:bg-ink hover:text-paper inline-flex min-h-11 w-11 shrink-0 items-center justify-center border"
        >
          <svg viewBox="0 0 24 24" className="size-6" fill="none" aria-hidden="true">
            <path
              d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1M3.5 4.5v3.4h3.4M12 7.5V12l3 2"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
      </div>

      <div className="flex gap-2">
        <Link
          href="/money/recurring"
          className="label-caps border-ink hover:bg-ink hover:text-paper inline-flex min-h-11 min-w-0 flex-1 items-center justify-center border px-3 text-center"
        >
          Rent and bills
        </Link>
      </div>

      <PendingSettlementsCard pending={pending} />

      {balances ? (
        <BalancesCard view={balances} />
      ) : (
        <Card>
          <CardLabel>Where you stand</CardLabel>
          <p role="alert" className="text-negative mt-3 text-sm">
            We couldn&rsquo;t load the balances. Please refresh the page.
          </p>
        </Card>
      )}

      <Card>
        <CardLabel>Recent expenses</CardLabel>
        <div className="mt-4">
          <ExpenseList items={expenses} viewerId={membership.profileId} />
        </div>
      </Card>
    </div>
  );
}

export default function MoneyPage() {
  return (
    <Suspense fallback={null}>
      <RequireFlat>
        <MoneyContent />
      </RequireFlat>
    </Suspense>
  );
}
