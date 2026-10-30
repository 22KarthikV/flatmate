import Link from "next/link";
import { Suspense } from "react";

import { Card, CardLabel } from "@/components/ui/card";
import { getMembers } from "@/features/household/members";
import { getMembership } from "@/features/household/membership";
import { RequireFlat } from "@/features/household/require-flat";
import { getWeekAvailability } from "@/features/rota/availability";
import { AvailabilityForm } from "@/features/rota/availability-form";
import { daysFor, summarise, type AnswerStatus } from "@/features/rota/availability-summary";
import {
  DEADLINE_SENTENCE,
  shortDate,
  upcomingWeekStart,
  weekdayName,
  windowState,
  addDays,
} from "@/features/rota/week";

export const metadata = { title: "Availability | FlatMate" };

const STATUS_TEXT: Record<AnswerStatus, string> = {
  answered: "Answered",
  assumed: "Not answered, treated as around every day",
  waiting: "Not answered yet",
};

async function AvailabilityContent() {
  const membership = await getMembership();
  if (!membership) return null;

  const now = new Date();
  const weekStart = upcomingWeekStart(now);
  const state = windowState(now, weekStart);
  const [members, rows] = await Promise.all([getMembers(), getWeekAvailability(weekStart)]);
  const mine = rows.filter((row) => row.profileId === membership.profileId);
  const people = summarise(weekStart, members, rows);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-8">
      <header className="flex flex-col gap-2">
        <Link
          href="/rota"
          className="label-caps text-muted inline-flex min-h-11 items-center underline underline-offset-4"
        >
          Rota
        </Link>
        <h1 className="font-display text-5xl sm:text-6xl">Availability</h1>
        <p className="text-muted max-w-md">
          Which days are you around next week, {weekdayName(weekStart)} {shortDate(weekStart)} to{" "}
          {weekdayName(addDays(weekStart, 6))} {shortDate(addDays(weekStart, 6))}? Chores are never
          given to you on a day you are away.
        </p>
      </header>

      <Card>
        <CardLabel>{state === "closed" ? "The deadline has passed" : "The deadline"}</CardLabel>
        <p className="mt-3 max-w-md">{DEADLINE_SENTENCE}</p>
        {state === "not_open" ? (
          <p className="text-muted mt-2">Answers open at the start of the Sunday before.</p>
        ) : null}
      </Card>

      <Card>
        <AvailabilityForm
          weekStart={weekStart}
          days={daysFor(weekStart, mine)}
          open={state === "open"}
        />
      </Card>

      <Card>
        <CardLabel>Who has answered</CardLabel>
        <ul className="mt-4 flex flex-col">
          {people.map((person) => (
            <li key={person.profileId} className="border-line border-b py-3">
              <p>{person.displayName}</p>
              <p className="text-muted text-sm">
                {STATUS_TEXT[person.status]}
                {person.status === "answered" && person.awayDays.length > 0
                  ? `. Away: ${person.awayDays.join(", ")}`
                  : ""}
              </p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

export default function AvailabilityPage() {
  return (
    <Suspense fallback={null}>
      <RequireFlat>
        <AvailabilityContent />
      </RequireFlat>
    </Suspense>
  );
}
