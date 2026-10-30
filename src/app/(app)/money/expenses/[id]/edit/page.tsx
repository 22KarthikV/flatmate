import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { Card } from "@/components/ui/card";
import { RequireFlat } from "@/features/household/require-flat";
import { getMembers } from "@/features/household/members";
import { getMembership } from "@/features/household/membership";
import { ExpenseForm } from "@/features/ledger/expense-form";
import { getExpense } from "@/features/ledger/expenses";
import { deriveInitialSplit, londonToday, parseExpenseId } from "@/features/ledger/form";
import { canChangeExpense } from "@/features/ledger/permissions";

export const metadata = { title: "Correct expense | FlatMate" };

async function EditContent({ params }: { params: Promise<{ id: string }> }) {
  const membership = await getMembership();
  if (!membership) return null;

  const id = parseExpenseId((await params).id);
  const expense = id ? await getExpense(id, membership.profileId) : null;
  if (!id || !expense) redirect("/money");
  // Cancelled or corrected expenses, and ones this person may not change, go back to the detail.
  if (
    !canChangeExpense(
      { createdBy: expense.createdById, voided: expense.voided },
      { profileId: membership.profileId, role: membership.role },
    )
  ) {
    redirect(`/money/expenses/${id}`);
  }

  const members = await getMembers();
  const split = deriveInitialSplit(
    expense.amountPence,
    expense.shares.map((share) => ({ profileId: share.profileId, pence: share.pence })),
  );

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-8">
      <header className="flex flex-col gap-2">
        <Link
          href={`/money/expenses/${id}`}
          className="label-caps text-muted inline-flex min-h-11 items-center underline underline-offset-4"
        >
          Expense
        </Link>
        <h1 className="font-display text-5xl sm:text-6xl">Correct expense</h1>
        <p className="text-muted max-w-md">
          The old version stays in the history, and everyone it involves is told.
        </p>
      </header>
      <Card>
        <ExpenseForm
          people={members.map(({ profileId, displayName }) => ({ profileId, displayName }))}
          viewerId={membership.profileId}
          today={londonToday()}
          expense={{
            id,
            initial: {
              amount: (expense.amountPence / 100).toFixed(2),
              description: expense.description,
              category: expense.category,
              occurredOn: expense.occurredOn,
              paidBy: expense.paidById,
              mode: split.mode,
              who: split.who,
              exact: split.exact,
              percent: {},
              one: "",
            },
          }}
        />
      </Card>
    </div>
  );
}

export default function EditExpensePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={null}>
      <RequireFlat>
        <EditContent params={params} />
      </RequireFlat>
    </Suspense>
  );
}
