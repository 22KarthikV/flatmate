import Link from "next/link";
import { Suspense } from "react";

import { Card, CardLabel } from "@/components/ui/card";
import { getMembership } from "@/features/household/membership";
import { RequireFlat } from "@/features/household/require-flat";
import { parseExpenseId } from "@/features/ledger/form";
import { getPersonLedger } from "@/features/ledger/person-data";
import { PersonLedgerView } from "@/features/ledger/person-ledger-view";

export const metadata = { title: "Where they stand | FlatMate" };

function NotFound() {
  return (
    <Card>
      <CardLabel>Where they stand</CardLabel>
      <p className="mt-3 text-lg">We couldn&rsquo;t find that person.</p>
      <p className="text-muted mt-2 max-w-md text-sm">
        They may not be in your flat, or the link may be wrong.
      </p>
    </Card>
  );
}

async function PersonContent({ params }: { params: Promise<{ id: string }> }) {
  const membership = await getMembership();
  if (!membership) return null;

  const id = parseExpenseId((await params).id);
  const view = id ? await getPersonLedger(membership.householdId, membership.profileId, id) : null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-8">
      <header className="flex flex-col gap-2">
        <Link
          href="/money"
          className="label-caps text-muted inline-flex min-h-11 items-center underline underline-offset-4"
        >
          Money
        </Link>
        <h1 className="font-display text-5xl sm:text-6xl">
          {view ? (view.person.isYou ? "You" : view.person.displayName) : "Person"}
        </h1>
      </header>
      {view ? (
        <Card>
          <CardLabel>Where {view.person.isYou ? "you" : "they"} stand</CardLabel>
          <div className="mt-3">
            <PersonLedgerView
              person={view.person}
              items={view.items}
              payments={view.payments}
              inconsistent={view.inconsistent}
            />
          </div>
        </Card>
      ) : (
        <NotFound />
      )}
    </div>
  );
}

export default function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={null}>
      <RequireFlat>
        <PersonContent params={params} />
      </RequireFlat>
    </Suspense>
  );
}
