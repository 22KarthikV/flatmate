import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardLabel } from "@/components/ui/card";

import { coverChore, excuseChore } from "./actions";
import type { OverdueItem } from "./overdue-model";
import { dayLabel } from "./week-model";

/** Unfinished chores from earlier weeks: finish them, cover them with this week's turn, or (admins) excuse them. */
export function OverdueCard({
  items,
  viewerId,
  isAdmin,
  today,
}: {
  items: OverdueItem[];
  viewerId: string;
  isAdmin: boolean;
  today: string;
}) {
  if (items.length === 0) return null;
  return (
    <Card>
      <CardLabel>Overdue</CardLabel>
      <p className="text-muted mt-2 max-w-md">
        Only chores that are done count towards your share, so these are still owed. Finish them, or
        if doing this week&rsquo;s turn cleaned the same thing, mark them as covered. Covering earns
        no extra credit.
      </p>
      <ul className="mt-2 flex flex-col">
        {items.map((item) => {
          const mine = item.assigneeId === viewerId;
          return (
            <li key={item.id} className="border-line flex flex-col gap-3 border-b py-4">
              <p>
                <Link
                  href={`/rota/assignments/${item.id}`}
                  className="underline underline-offset-4"
                >
                  {item.choreName}
                </Link>
                , {mine ? "yours" : item.assigneeName}, was due {dayLabel(item.dueOn, today)}.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  href={`/rota/assignments/${item.id}`}
                  className="label-caps inline-flex min-h-11 items-center underline underline-offset-4"
                >
                  Open to finish
                </Link>
                {item.coverBy ? (
                  <form action={coverChore}>
                    <input type="hidden" name="assignmentId" value={item.id} />
                    <input type="hidden" name="coveredBy" value={item.coverBy.id} />
                    <Button type="submit" variant="secondary">
                      Covered by this week&rsquo;s {item.choreName}
                    </Button>
                  </form>
                ) : null}
                {isAdmin ? (
                  <form action={excuseChore}>
                    <input type="hidden" name="assignmentId" value={item.id} />
                    <Button type="submit" variant="ghost">
                      Excuse {mine ? "mine" : item.assigneeName}
                    </Button>
                  </form>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
