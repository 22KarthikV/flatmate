import Link from "next/link";

import { Card, CardLabel } from "@/components/ui/card";

import { STATUS_WORDS, type EventView } from "./event-model";
import { closesText, eventRange } from "./format";

/** One row of the list: title, status, and the next step for the viewer. */
export function EventCard({ event, now }: { event: EventView; now: Date }) {
  let next: string;
  if (event.status === "voting") {
    next = event.needsMyVote
      ? `Needs your vote. ${closesText(event.voteDeadline, now)}.`
      : `You have voted. ${closesText(event.voteDeadline, now)}.`;
  } else if (event.status === "tiebreak") {
    next = `Waiting for ${event.organiserName} to pick a date.`;
  } else if (event.status === "confirmed" && event.startsAt) {
    next = eventRange(event.startsAt, event.endsAt);
  } else {
    next = event.cancelledReason ?? "Cancelled.";
  }

  return (
    <Card className="p-0">
      <Link
        href={`/events/${event.id}`}
        className="flex min-h-11 flex-col gap-1 p-6 focus-visible:outline-offset-[-4px]"
      >
        <CardLabel>{STATUS_WORDS[event.status]}</CardLabel>
        <span className="text-xl">{event.title}</span>
        <span className="text-muted text-sm">{next}</span>
        {event.location ? <span className="text-muted text-sm">{event.location}</span> : null}
      </Link>
    </Card>
  );
}
