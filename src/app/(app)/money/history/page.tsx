import Link from "next/link";
import { Suspense } from "react";

import { Card, CardLabel } from "@/components/ui/card";
import { RequireFlat } from "@/features/household/require-flat";
import { getMembership } from "@/features/household/membership";
import { ExpenseFilter } from "@/features/ledger/expense-filter";
import { HISTORY_LIMIT, getRecentExpenses } from "@/features/ledger/expenses";
import { getPaymentHistory } from "@/features/ledger/payment-history";
import { PaymentHistoryList } from "@/features/ledger/payment-history-list";

export const metadata = { title: "Money history | FlatMate" };

async function HistoryContent() {
  const membership = await getMembership();
  if (!membership) return null;
  const [payments, expenses] = await Promise.all([
    getPaymentHistory(),
    getRecentExpenses(membership.profileId, HISTORY_LIMIT),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-8">
      <header className="flex flex-col gap-2">
        <Link
          href="/money"
          className="label-caps text-muted inline-flex min-h-11 items-center underline underline-offset-4"
        >
          Money
        </Link>
        <h1 className="font-display text-5xl sm:text-6xl">History</h1>
        <p className="text-muted max-w-md">
          Every payment and expense in {membership.householdName}, including ones that were
          cancelled or corrected.
        </p>
      </header>

      <Card>
        <CardLabel>Payments</CardLabel>
        <div className="mt-4">
          <PaymentHistoryList items={payments} viewerId={membership.profileId} />
        </div>
      </Card>

      <Card>
        <CardLabel>Expenses</CardLabel>
        <div className="mt-4">
          <ExpenseFilter items={expenses} viewerId={membership.profileId} initial="all" />
        </div>
      </Card>
    </div>
  );
}

export default function HistoryPage() {
  return (
    <Suspense fallback={null}>
      <RequireFlat>
        <HistoryContent />
      </RequireFlat>
    </Suspense>
  );
}
