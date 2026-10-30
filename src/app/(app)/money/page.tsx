import Link from "next/link";
import { Suspense } from "react";

import { Card, CardLabel } from "@/components/ui/card";
import { RequireFlat } from "@/features/household/require-flat";
import { getMembership } from "@/features/household/membership";
import { ExpenseList } from "@/features/ledger/expense-list";
import { getRecentExpenses } from "@/features/ledger/expenses";

export const metadata = { title: "Money | FlatMate" };

async function MoneyContent() {
  const membership = await getMembership();
  if (!membership) return null;
  const expenses = await getRecentExpenses(membership.profileId);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-8">
      <header className="flex flex-col gap-2">
        <p className="label-caps text-muted">Rent, bills and expenses</p>
        <h1 className="font-display text-5xl sm:text-6xl">Money</h1>
        <p className="text-muted max-w-md">Shared expenses for {membership.householdName}.</p>
      </header>

      <div>
        <Link
          href="/money/add"
          className="label-caps bg-ink text-paper inline-flex min-h-11 items-center px-6 hover:opacity-85"
        >
          Add expense
        </Link>
      </div>

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
