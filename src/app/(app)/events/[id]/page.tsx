import Link from "next/link";
import { Suspense } from "react";

import { Card, CardLabel } from "@/components/ui/card";
import { STATUS_WORDS } from "@/features/events/event-model";
import { getEvent } from "@/features/events/events";
import { closesText, eventRange } from "@/features/events/format";
import { OrganiserPanel } from "@/features/events/organiser-panel";
import { parseEventId } from "@/features/events/schemas";
import { VotePanel } from "@/features/events/vote-panel";
import { getMembership } from "@/features/household/membership";
import { RequireFlat } from "@/features/household/require-flat";

export const metadata = { title: "Event | FlatMate" };

function NotFound() {
  return (
    <Card>
      <CardLabel>Event</CardLabel>
      <p className="mt-3 text-lg">We couldn&rsquo;t find that event.</p>
      <p className="text-muted mt-2 max-w-md text-sm">
        It may belong to another flat, or the link may be wrong.
      </p>
    </Card>
  );
}

async function EventContent({ params }: { params: Promise<{ id: string }> }) {
  const membership = await getMembership();
  if (!membership) return null;
  const id = parseEventId((await params).id);
  const event = id ? await getEvent(id) : null;
  const now = new Date();
  const isAdmin = membership.role === "owner" || membership.role === "admin";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-8">
      <header className="flex flex-col gap-2">
        <Link
          href="/events"
          className="label-caps text-muted inline-flex min-h-11 items-center underline underline-offset-4"
        >
          Events
        </Link>
        <h1 className="font-display text-4xl sm:text-5xl">{event ? event.title : "Event"}</h1>
      </header>

      {event ? (
        <>
          <Card>
            <CardLabel>{STATUS_WORDS[event.status]}</CardLabel>
            {event.status === "confirmed" && event.startsAt ? (
              <p className="mt-3 text-lg">{eventRange(event.startsAt, event.endsAt)}</p>
            ) : null}
            {event.status === "voting" ? (
              <p className="mt-3 text-lg">{closesText(event.voteDeadline, now)}</p>
            ) : null}
            {event.status === "tiebreak" ? (
              <p className="mt-3 text-lg">Waiting for {event.organiserName} to pick a date.</p>
            ) : null}
            {event.status === "cancelled" ? (
              <p className="mt-3 text-lg">
                {event.cancelledReason ?? "Cancelled"}
                {event.cancelledByName ? `, by ${event.cancelledByName}` : ""}
              </p>
            ) : null}
            {event.location ? <p className="text-muted mt-2">Where: {event.location}</p> : null}
            <p className="text-muted mt-2 text-sm">Organised by {event.organiserName}</p>
            {event.description ? <p className="mt-4 max-w-prose">{event.description}</p> : null}
          </Card>

          <Card>
            <CardLabel>{event.status === "confirmed" ? "How it was decided" : "Dates"}</CardLabel>
            <div className="mt-4">
              <VotePanel event={event} />
            </div>
          </Card>

          <OrganiserPanel
            event={event}
            isOrganiser={event.organiserId === membership.profileId}
            isAdmin={isAdmin}
          />
        </>
      ) : (
        <NotFound />
      )}
    </div>
  );
}

export default function EventPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={null}>
      <RequireFlat>
        <EventContent params={params} />
      </RequireFlat>
    </Suspense>
  );
}
