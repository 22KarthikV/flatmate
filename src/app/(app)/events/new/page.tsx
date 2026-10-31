import Link from "next/link";
import { Suspense } from "react";

import { Card } from "@/components/ui/card";
import { ProposeEventForm } from "@/features/events/event-form";
import { RequireFlat } from "@/features/household/require-flat";

export const metadata = { title: "Propose an event | FlatMate" };

function NewEventContent() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-8">
      <header className="flex flex-col gap-2">
        <Link
          href="/events"
          className="label-caps text-muted inline-flex min-h-11 items-center underline underline-offset-4"
        >
          Events
        </Link>
        <h1 className="font-display text-5xl sm:text-6xl">Propose an event</h1>
      </header>
      <Card>
        <ProposeEventForm nowIso={new Date().toISOString()} />
      </Card>
    </div>
  );
}

export default function NewEventPage() {
  return (
    <Suspense fallback={null}>
      <RequireFlat>
        <NewEventContent />
      </RequireFlat>
    </Suspense>
  );
}
