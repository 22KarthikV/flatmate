import Link from "next/link";
import { Suspense } from "react";

import { Card } from "@/components/ui/card";
import { RequireFlat } from "@/features/household/require-flat";
import { getMembership } from "@/features/household/membership";
import { getSettlementRecipients } from "@/features/ledger/recipients";
import { prefillSettlement } from "@/features/ledger/settle";
import { SettleForm } from "@/features/ledger/settle-form";

export const metadata = { title: "Record a payment | FlatMate" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

async function SettleContent({ searchParams }: { searchParams: SearchParams }) {
  const membership = await getMembership();
  if (!membership) return null;
  const [recipients, params] = await Promise.all([
    getSettlementRecipients(membership.householdId, membership.profileId),
    searchParams,
  ]);
  const everyone = [...recipients.current, ...recipients.former];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-8">
      <header className="flex flex-col gap-2">
        <Link
          href="/money"
          className="label-caps text-muted inline-flex min-h-11 items-center underline underline-offset-4"
        >
          Money
        </Link>
        <h1 className="font-display text-5xl sm:text-6xl">Record a payment</h1>
        <p className="text-muted max-w-md">
          Pay your flatmate however you like, then record it here. Nothing moves through FlatMate.
        </p>
      </header>
      <Card>
        {everyone.length === 0 ? (
          <p className="text-muted max-w-md text-sm">
            There is nobody else in your flat to pay yet. Invite a flatmate first.
          </p>
        ) : (
          <SettleForm
            people={recipients.current}
            former={recipients.former}
            initial={prefillSettlement(
              params,
              everyone.map((person) => person.profileId),
              membership.profileId,
            )}
          />
        )}
      </Card>
    </div>
  );
}

export default function SettlePage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={null}>
      <RequireFlat>
        <SettleContent searchParams={searchParams} />
      </RequireFlat>
    </Suspense>
  );
}
