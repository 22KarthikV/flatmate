import Link from "next/link";
import { Suspense } from "react";

import { RequireFlat } from "@/features/household/require-flat";
import { getMembership } from "@/features/household/membership";
import { FixList } from "@/features/fixes/fix-list";
import { getReports } from "@/features/fixes/fixes";

export const metadata = { title: "Fix-it log | FlatMate" };

async function FixesContent() {
  const membership = await getMembership();
  if (!membership) return null;
  const reports = await getReports();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-8">
      <header className="flex flex-col gap-2">
        <Link
          href="/more"
          className="label-caps text-muted inline-flex min-h-11 items-center underline underline-offset-4"
        >
          More
        </Link>
        <h1 className="font-display text-5xl sm:text-6xl">Fix-it log</h1>
        <p className="text-muted max-w-md">
          Problems in {membership.householdName}, who is chasing the landlord, and what is fixed.
        </p>
        <Link
          href="/more/fixes/new"
          className="bg-ink text-paper label-caps inline-flex min-h-11 w-fit items-center px-5"
        >
          Report a problem
        </Link>
      </header>
      <FixList reports={reports} now={new Date().toISOString()} />
    </div>
  );
}

export default function FixesPage() {
  return (
    <Suspense fallback={null}>
      <RequireFlat>
        <FixesContent />
      </RequireFlat>
    </Suspense>
  );
}
