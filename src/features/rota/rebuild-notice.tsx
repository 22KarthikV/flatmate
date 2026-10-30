import { Button } from "@/components/ui/button";
import { Card, CardLabel } from "@/components/ui/card";

import { undoRebuild } from "./actions";
import type { RecentRebuild } from "./rebuilds";

function untilLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Europe/London",
  }).format(new Date(iso));
}

/** Tells admins what moved after someone left, and offers the 24-hour undo. */
export function RebuildNotice({ rebuilds }: { rebuilds: RecentRebuild[] }) {
  if (rebuilds.length === 0) return null;

  return (
    <Card>
      <CardLabel>After someone left</CardLabel>
      <ul className="mt-2 flex flex-col">
        {rebuilds.map((rebuild) => (
          <li key={rebuild.id} className="border-line flex flex-col gap-3 border-b py-4">
            <p>
              {rebuild.leaverName} left, so {rebuild.moved}{" "}
              {rebuild.moved === 1 ? "chore was" : "chores were"} given to other people and everyone
              affected has been told.
              {rebuild.unassigned > 0
                ? ` ${rebuild.unassigned} could not be given to anyone because nobody was around.`
                : ""}
            </p>
            <p className="text-muted">
              You can undo this until {untilLabel(rebuild.undoUntil)}. Undoing puts chores back with
              the person they were taken from, if they are still here. {rebuild.leaverName}&rsquo;s
              own chores stay with their new person.
            </p>
            <form action={undoRebuild}>
              <input type="hidden" name="rebuildId" value={rebuild.id} />
              <Button type="submit" variant="secondary">
                Undo the changes after {rebuild.leaverName} left
              </Button>
            </form>
          </li>
        ))}
      </ul>
    </Card>
  );
}
