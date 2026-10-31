import Link from "next/link";
import { Suspense } from "react";

import { Card, CardLabel } from "@/components/ui/card";
import { EditEventForm } from "@/features/events/event-form";
import { getEvent } from "@/features/events/events";
import { toLocalInput } from "@/features/events/format";
import { parseEventId } from "@/features/events/schemas";
import { getMembership } from "@/features/household/membership";
import { RequireFlat } from "@/features/household/require-flat";

export const metadata = { title: "Edit event | FlatMate" };

async function EditContent({ params }: { params: Promise<{ id: string }> }) {
  const membership = await getMembership();
  if (!membership) return null;
  const id = parseEventId((await params).id);
  const event = id ? await getEvent(id) : null;
  const allowed =
    event !== null && event.organiserId === membership.profileId && event.status !== "cancelled";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-8">
      <header className="flex flex-col gap-2">
        <Link
          href={id ? `/events/${id}` : "/events"}
          className="label-caps text-muted inline-flex min-h-11 items-center underline underline-offset-4"
        >
          Back to the event
        </Link>
        <h1 className="font-display text-4xl sm:text-5xl">Edit event</h1>
      </header>
      {allowed && event ? (
        <Card>
          <EditEventForm
            event={{
              id: event.id,
              title: event.title,
              description: event.description,
              location: event.location,
              deadline: toLocalInput(new Date(event.voteDeadline)),
              votingOpen: event.status === "voting",
            }}
          />
        </Card>
      ) : (
        <Card>
          <CardLabel>Event</CardLabel>
          <p className="mt-3 text-lg">
            {event ? "Only the organiser can edit this event." : "We couldn’t find that event."}
          </p>
        </Card>
      )}
    </div>
  );
}

export default function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={null}>
      <RequireFlat>
        <EditContent params={params} />
      </RequireFlat>
    </Suspense>
  );
}
