import { Button } from "@/components/ui/button";
import { Card, CardLabel } from "@/components/ui/card";

import { cancelSwap, decideSwap } from "./actions";
import type { PendingSwap } from "./swaps";
import { dayLabel } from "./week-model";

/** Open swap requests that involve the viewer: ones to answer first, then ones they asked. */
export function SwapRequests({
  swaps,
  viewerId,
  today,
}: {
  swaps: PendingSwap[];
  viewerId: string;
  today: string;
}) {
  const incoming = swaps.filter((swap) => swap.toId === viewerId);
  const outgoing = swaps.filter((swap) => swap.fromId === viewerId);
  if (incoming.length === 0 && outgoing.length === 0) return null;

  return (
    <Card>
      <CardLabel>Swap requests</CardLabel>
      <ul className="mt-2 flex flex-col">
        {incoming.map((swap) => (
          <li key={swap.id} className="border-line flex flex-col gap-3 border-b py-4">
            <p>
              {swap.fromName} asks you to take {swap.choreName}, {dayLabel(swap.dueOn, today)}
              {swap.inReturn
                ? `, and they would take your ${swap.inReturn.choreName}, ${dayLabel(swap.inReturn.dueOn, today)}`
                : ""}
              .
            </p>
            <div className="flex flex-wrap gap-3">
              <form action={decideSwap}>
                <input type="hidden" name="swapId" value={swap.id} />
                <input type="hidden" name="accept" value="yes" />
                <Button type="submit">Accept {swap.fromName}&rsquo;s swap</Button>
              </form>
              <form action={decideSwap}>
                <input type="hidden" name="swapId" value={swap.id} />
                <input type="hidden" name="accept" value="no" />
                <Button type="submit" variant="secondary">
                  Decline
                </Button>
              </form>
            </div>
          </li>
        ))}
        {outgoing.map((swap) => (
          <li key={swap.id} className="border-line flex flex-col gap-3 border-b py-4">
            <p className="text-muted">
              You asked {swap.toName} to take {swap.choreName}, {dayLabel(swap.dueOn, today)}. It
              stays yours until they accept.
            </p>
            <form action={cancelSwap}>
              <input type="hidden" name="swapId" value={swap.id} />
              <Button type="submit" variant="ghost">
                Withdraw request to {swap.toName}
              </Button>
            </form>
          </li>
        ))}
      </ul>
    </Card>
  );
}
