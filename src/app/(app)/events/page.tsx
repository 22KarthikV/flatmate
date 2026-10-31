import Link from "next/link";
import { Suspense } from "react";

import { Card, CardLabel } from "@/components/ui/card";
import { EventCard } from "@/features/events/event-card";
import { groupEvents, type EventView } from "@/features/events/event-model";
import { getEvents } from "@/features/events/events";
import { RequireFlat } from "@/features/household/require-flat";

export const metadata = { title: "Events | FlatMate" };

function Section({ title, events, now }: { title: string; events: EventView[]; now: Date }) {
  if (events.length === 0) return null;
  return (
    <section className="flex flex-col gap-4" aria-label={title}>
      <h2 className="label-caps text-muted">{title}</h2>
      {events.map((event) => (
        <EventCard key={event.id} event={event} now={now} />
      ))}
    </section>
  );
}

async function EventsContent() {
  const now = new Date();
  const groups = groupEvents(await getEvents(), now);
  const nothing =
    groups.needsVote.length +
      groups.waitingOnOrganiser.length +
      groups.stillVoting.length +
      groups.comingUp.length ===
    0;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-8">
      <header className="flex flex-col gap-2">
        <p className="label-caps text-muted">Together</p>
        <h1 className="font-display text-5xl sm:text-6xl">Events</h1>
        <p className="text-muted max-w-md">
          Pick a day, everyone votes, and the first date with more than half saying yes is on.
        </p>
      </header>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/events/new"
          className="label-caps bg-ink text-paper inline-flex min-h-11 items-center px-6"
        >
          Propose an event
        </Link>
        <Link
          href="/events/calendar"
          className="label-caps border-ink inline-flex min-h-11 items-center border px-6"
        >
          Calendar
        </Link>
      </div>

      {nothing ? (
        <Card>
          <CardLabel>Nothing planned</CardLabel>
          <p className="mt-3 text-lg">No events yet.</p>
          <p className="text-muted mt-2 max-w-md text-sm">
            Propose a film night or a takeaway and let the flat choose the day.
          </p>
        </Card>
      ) : null}

      <Section title="Needs your vote" events={groups.needsVote} now={now} />
      <Section title="Waiting for the organiser" events={groups.waitingOnOrganiser} now={now} />
      <Section title="Still deciding" events={groups.stillVoting} now={now} />
      <Section title="Coming up" events={groups.comingUp} now={now} />

      {groups.past.length > 0 ? (
        <details className="flex flex-col gap-4">
          <summary className="label-caps text-muted min-h-11 cursor-pointer py-3">
            Past and cancelled ({groups.past.length})
          </summary>
          <div className="mt-2 flex flex-col gap-4">
            {groups.past.map((event) => (
              <EventCard key={event.id} event={event} now={now} />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

export default function EventsPage() {
  return (
    <Suspense fallback={null}>
      <RequireFlat>
        <EventsContent />
      </RequireFlat>
    </Suspense>
  );
}
