import { Card, CardLabel } from "@/components/ui/card";

import type { PersonFairness } from "./fairness-view";

function Bar({ value, max }: { value: number; max: number }) {
  const width = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div aria-hidden="true" className="bg-line h-2 w-full">
      <div className="bg-ink h-2" style={{ width: `${width}%` }} />
    </div>
  );
}

/**
 * Who did what over a period, in effort points and chores, with anything left undone stated plainly
 * and anyone owed a turn. Read-only.
 */
export function FairnessList({ people, viewerId }: { people: PersonFairness[]; viewerId: string }) {
  const max = Math.max(0, ...people.map((person) => person.givenEffort));
  if (people.length === 0) return null;

  return (
    <ul className="flex flex-col gap-4">
      {people.map((person) => (
        <li key={person.profileId}>
          <Card>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-2xl">
                {person.displayName}
                {person.profileId === viewerId ? " (you)" : ""}
              </h2>
              <p className="label-caps text-muted">
                {person.doneEffort} of {person.givenEffort} effort points done
              </p>
            </div>
            <div className="mt-3 flex flex-col gap-2">
              <Bar value={person.givenEffort} max={max} />
              <Bar value={person.doneEffort} max={max} />
            </div>
            <p className="text-muted mt-3 text-sm">
              {person.doneCount} of {person.givenCount} chores finished
              {person.overdueCount > 0 ? `, ${person.overdueCount} overdue and still theirs` : ""}.
            </p>
            {person.awayDays > 0 ? (
              <p className="text-muted mt-3 text-sm">
                Away {person.awayDays} {person.awayDays === 1 ? "day" : "days"} in this period. Away
                days do not count against anyone&rsquo;s share.
              </p>
            ) : null}
            {person.byChore.length > 0 ? (
              <ul className="mt-3 flex flex-col text-sm">
                {person.byChore.map((tally) => (
                  <li
                    key={tally.choreName}
                    className="border-line flex justify-between border-b py-2"
                  >
                    <span>{tally.choreName}</span>
                    <span className="text-muted">
                      {tally.done} of {tally.given}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted mt-3 text-sm">No chores came due in this period.</p>
            )}
            {person.owedChores.length > 0 ? (
              <p className="mt-3 text-sm">
                <CardLabel className="inline">Owed a turn: </CardLabel>
                {person.owedChores.join(", ")}. They were passed over, so they are next in line.
              </p>
            ) : null}
          </Card>
        </li>
      ))}
    </ul>
  );
}
