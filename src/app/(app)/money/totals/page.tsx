import Link from "next/link";
import { Suspense } from "react";

import { getMembership } from "@/features/household/membership";
import { RequireFlat } from "@/features/household/require-flat";
import { getTotals } from "@/features/totals/data";
import { TotalsView } from "@/features/totals/totals-view";

export const metadata = { title: "Totals | FlatMate" };

async function TotalsContent() {
  const membership = await getMembership();
  if (!membership) return null;
  const totals = await getTotals(membership.householdId, membership.profileId);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-8">
      <header className="flex flex-col gap-2">
        <Link
          href="/money"
          className="label-caps text-muted inline-flex min-h-11 items-center underline underline-offset-4"
        >
          Money
        </Link>
        <h1 className="font-display text-5xl sm:text-6xl">Totals</h1>
        <p className="text-muted max-w-md">
          Everything you owe and are owed in {membership.householdName}, rent included.
        </p>
      </header>

      {totals ? (
        <TotalsView totals={totals} />
      ) : (
        <p role="alert" className="text-negative max-w-md text-sm">
          We couldn&rsquo;t load your totals. Please refresh the page.
        </p>
      )}
    </div>
  );
}

export default function TotalsPage() {
  return (
    <Suspense fallback={null}>
      <RequireFlat>
        <TotalsContent />
      </RequireFlat>
    </Suspense>
  );
}
