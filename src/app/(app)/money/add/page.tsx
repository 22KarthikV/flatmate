import Link from "next/link";
import { Suspense } from "react";

import { Card } from "@/components/ui/card";
import { RequireFlat } from "@/features/household/require-flat";
import { getMembers } from "@/features/household/members";
import { getMembership } from "@/features/household/membership";
import { ExpenseForm } from "@/features/ledger/expense-form";
import { londonToday } from "@/features/ledger/form";

export const metadata = { title: "Add expense | FlatMate" };

async function AddContent() {
  const membership = await getMembership();
  if (!membership) return null;
  const members = await getMembers();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-8">
      <header className="flex flex-col gap-2">
        <Link
          href="/money"
          className="label-caps text-muted inline-flex min-h-11 items-center underline underline-offset-4"
        >
          Money
        </Link>
        <h1 className="font-display text-5xl sm:text-6xl">Add expense</h1>
        <p className="text-muted max-w-md">Everyone it involves is told what their share is.</p>
      </header>
      <Card>
        <ExpenseForm
          people={members.map(({ profileId, displayName }) => ({ profileId, displayName }))}
          viewerId={membership.profileId}
          today={londonToday()}
        />
      </Card>
    </div>
  );
}

export default function AddExpensePage() {
  return (
    <Suspense fallback={null}>
      <RequireFlat>
        <AddContent />
      </RequireFlat>
    </Suspense>
  );
}
