import Link from "next/link";
import { Suspense } from "react";

import { getMembers } from "@/features/household/members";
import { getMembership } from "@/features/household/membership";
import { RequireFlat } from "@/features/household/require-flat";
import { getOwedTurns, getPastAssignments } from "@/features/rota/fairness-data";
import { FairnessList } from "@/features/rota/fairness-list";
import {
  PERIODS,
  parsePeriod,
  periodStart,
  summariseFairness,
} from "@/features/rota/fairness-view";
import { londonDate, shortDate } from "@/features/rota/week";
import { cn } from "@/lib/cn";

export const metadata = { title: "Fairness | FlatMate" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

async function FairnessContent({ searchParams }: { searchParams: SearchParams }) {
  const membership = await getMembership();
  if (!membership) return null;

  const raw = (await searchParams).period;
  const period = parsePeriod(Array.isArray(raw) ? raw[0] : raw);
  const today = londonDate(new Date());
  const start = periodStart(today, period.weeks);
  const [members, assignments, owed] = await Promise.all([
    getMembers(),
    getPastAssignments(start, today),
    getOwedTurns(),
  ]);
  const people = summariseFairness({ people: members, assignments, owed, start, today });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-8">
      <header className="flex flex-col gap-2">
        <Link
          href="/rota"
          className="label-caps text-muted inline-flex min-h-11 items-center underline underline-offset-4"
        >
          Rota
        </Link>
        <h1 className="font-display text-5xl sm:text-6xl">Fairness</h1>
        <p className="text-muted max-w-md">
          Who has done what in {membership.householdName}, from {shortDate(start)} to today. Effort
          points count how big a chore is, not how long it took.
        </p>
        <nav aria-label="Period" className="flex flex-wrap gap-x-6">
          {PERIODS.map((option) => (
            <Link
              key={option.id}
              href={`/rota/fairness?period=${option.id}`}
              aria-current={option.id === period.id ? "page" : undefined}
              className={cn(
                "label-caps inline-flex min-h-11 items-center underline underline-offset-4",
                option.id === period.id ? "text-ink" : "text-muted",
              )}
            >
              {option.label}
            </Link>
          ))}
        </nav>
      </header>

      <FairnessList people={people} viewerId={membership.profileId} />
    </div>
  );
}

export default function FairnessPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={null}>
      <RequireFlat>
        <FairnessContent searchParams={searchParams} />
      </RequireFlat>
    </Suspense>
  );
}
