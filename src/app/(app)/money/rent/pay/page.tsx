import Link from "next/link";
import { Suspense } from "react";

import { Card, CardLabel } from "@/components/ui/card";
import { getMembership } from "@/features/household/membership";
import { RequireFlat } from "@/features/household/require-flat";
import { getMyRent } from "@/features/recurring/rent";
import { totalOwed } from "@/features/recurring/rent-status";
import { RentPayForm } from "@/features/recurring/rent-pay-form";

export const metadata = { title: "I paid my rent | FlatMate" };

async function PayContent() {
  const membership = await getMembership();
  if (!membership) return null;

  const rows = await getMyRent();
  const owed = totalOwed(rows);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-8">
      <header className="flex flex-col gap-2">
        <Link
          href="/money/rent"
          className="label-caps text-muted inline-flex min-h-11 items-center underline underline-offset-4"
        >
          Your rent
        </Link>
        <h1 className="font-display text-5xl sm:text-6xl">I paid my rent</h1>
      </header>

      <Card>
        <CardLabel>Record a payment</CardLabel>
        <div className="mt-4">
          {owed > 0 ? (
            <RentPayForm
              owedPence={owed}
              collectorName={rows[0]?.collectorName ?? "The collector"}
            />
          ) : (
            <p className="max-w-md text-lg">You don&rsquo;t owe any rent right now.</p>
          )}
        </div>
      </Card>
    </div>
  );
}

export default function PayRentPage() {
  return (
    <Suspense fallback={null}>
      <RequireFlat>
        <PayContent />
      </RequireFlat>
    </Suspense>
  );
}
