import Link from "next/link";
import { Suspense } from "react";

import { Card, CardLabel } from "@/components/ui/card";
import { RequireFlat } from "@/features/household/require-flat";
import { getMembership } from "@/features/household/membership";
import { ExpenseView } from "@/features/ledger/expense-view";
import { getExpense } from "@/features/ledger/expenses";
import { parseExpenseId } from "@/features/ledger/form";
import { canChangeExpense } from "@/features/ledger/permissions";

export const metadata = { title: "Expense | FlatMate" };

function NotFound() {
  return (
    <Card>
      <CardLabel>Expense</CardLabel>
      <p className="mt-3 text-lg">We couldn&rsquo;t find that expense.</p>
      <p className="text-muted mt-2 max-w-md text-sm">
        It may belong to another flat, or the link may be wrong.
      </p>
    </Card>
  );
}

async function ExpenseContent({ params }: { params: Promise<{ id: string }> }) {
  const membership = await getMembership();
  if (!membership) return null;

  const id = parseExpenseId((await params).id);
  const expense = id ? await getExpense(id, membership.profileId) : null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-8">
      <header className="flex flex-col gap-2">
        <Link
          href="/money"
          className="label-caps text-muted inline-flex min-h-11 items-center underline underline-offset-4"
        >
          Money
        </Link>
        <h1 className="font-display text-5xl sm:text-6xl">Expense</h1>
      </header>
      {expense ? (
        <ExpenseView
          expense={expense}
          viewerId={membership.profileId}
          canChange={canChangeExpense(
            { createdBy: expense.createdById, voided: expense.voided },
            { profileId: membership.profileId, role: membership.role },
          )}
        />
      ) : (
        <NotFound />
      )}
    </div>
  );
}

export default function ExpensePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={null}>
      <RequireFlat>
        <ExpenseContent params={params} />
      </RequireFlat>
    </Suspense>
  );
}
