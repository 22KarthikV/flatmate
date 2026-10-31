import Link from "next/link";
import { Suspense } from "react";

import { RequireFlat } from "@/features/household/require-flat";
import { getMembership } from "@/features/household/membership";
import { BinDays } from "@/features/bins/bin-days";
import { getBins } from "@/features/bins/bins";
import { nextCollections } from "@/features/bins/view";
import { londonToday } from "@/features/ledger/form";

export const metadata = { title: "Bin days | FlatMate" };

async function BinsContent() {
  const membership = await getMembership();
  if (!membership) return null;
  const isAdmin = membership.role === "owner" || membership.role === "admin";
  const { streams, exceptions } = await getBins();
  const today = londonToday();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-8">
      <header className="flex flex-col gap-2">
        <Link
          href="/more"
          className="label-caps text-muted inline-flex min-h-11 items-center underline underline-offset-4"
        >
          More
        </Link>
        <h1 className="font-display text-5xl sm:text-6xl">Bin days</h1>
        <p className="text-muted max-w-md">
          Which bin goes out and when, for {membership.householdName}. You get a nudge the evening
          before. FlatMate does not check your council, so an admin keeps this up to date.
        </p>
      </header>
      <BinDays
        collections={nextCollections(streams, exceptions, today)}
        today={today}
        isAdmin={isAdmin}
        hasBins={streams.length > 0}
      />
      {isAdmin && streams.length > 0 ? (
        <Link
          href="/more/bins/manage"
          className="label-caps inline-flex min-h-11 items-center underline underline-offset-4"
        >
          Change bins or a collection
        </Link>
      ) : null}
    </div>
  );
}

export default function BinsPage() {
  return (
    <Suspense fallback={null}>
      <RequireFlat>
        <BinsContent />
      </RequireFlat>
    </Suspense>
  );
}
