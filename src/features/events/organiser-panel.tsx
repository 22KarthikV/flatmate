import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardLabel } from "@/components/ui/card";

import { cancelEvent, decideTie, removeOption } from "./actions";
import { AddDateForm } from "./add-date-form";
import type { EventView } from "./event-model";
import { eventRange } from "./format";
import { OPTIONS_MAX, OPTIONS_MIN, REASON_MAX } from "./schemas";

const fieldClass =
  "border-ink min-h-11 w-full border-0 border-b bg-transparent px-0 text-base focus-visible:outline-offset-4";

/**
 * What the organiser can do, and what an admin can do for an event whose organiser is away.
 * The database checks who is allowed; this only decides what to show.
 */
export function OrganiserPanel({
  event,
  isOrganiser,
  isAdmin,
}: {
  event: EventView;
  isOrganiser: boolean;
  isAdmin: boolean;
}) {
  const live = event.status !== "cancelled";
  if (!live || (!isOrganiser && !isAdmin)) return null;
  const voting = event.status === "voting";

  return (
    <div className="flex flex-col gap-8">
      {isOrganiser && event.status === "tiebreak" ? (
        <Card>
          <CardLabel>Pick a date</CardLabel>
          <p className="mt-3 max-w-md">
            These dates are tied. Choose one. If you do nothing, the earliest is chosen for you
            after 48 hours.
          </p>
          <ul className="mt-4 flex flex-col gap-3">
            {event.options
              .filter((option) => option.leading)
              .map((option) => (
                <li key={option.id}>
                  <form action={decideTie}>
                    <input type="hidden" name="eventId" value={event.id} />
                    <input type="hidden" name="optionId" value={option.id} />
                    <Button type="submit" className="w-full sm:w-auto">
                      {eventRange(option.startsAt, option.endsAt)}
                    </Button>
                  </form>
                </li>
              ))}
          </ul>
        </Card>
      ) : null}

      {isOrganiser ? (
        <Card>
          <CardLabel>Organiser</CardLabel>
          <p className="mt-3">
            <Link
              href={`/events/${event.id}/edit`}
              className="inline-flex min-h-11 items-center underline underline-offset-4"
            >
              Edit the title, place or deadline
            </Link>
          </p>
          {voting ? (
            <>
              <div className="mt-6">
                <CardLabel>Dates</CardLabel>
                <ul className="mt-3 flex flex-col gap-2">
                  {event.options.map((option) => (
                    <li key={option.id} className="flex items-center justify-between gap-4">
                      <span>{eventRange(option.startsAt, option.endsAt)}</span>
                      {event.options.length > OPTIONS_MIN ? (
                        <form action={removeOption}>
                          <input type="hidden" name="optionId" value={option.id} />
                          <Button
                            type="submit"
                            variant="ghost"
                            aria-label={`Drop ${eventRange(option.startsAt, option.endsAt)}`}
                          >
                            Drop
                          </Button>
                        </form>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
              {event.options.length < OPTIONS_MAX ? (
                <div className="mt-6">
                  <AddDateForm eventId={event.id} />
                </div>
              ) : null}
            </>
          ) : null}
        </Card>
      ) : null}

      <Card>
        <CardLabel>Cancel this event</CardLabel>
        <form action={cancelEvent} className="mt-4 flex flex-col gap-4">
          <input type="hidden" name="eventId" value={event.id} />
          <div className="flex flex-col gap-2">
            <label htmlFor="cancel-reason" className="label-caps text-muted">
              Reason (optional)
            </label>
            <input
              id="cancel-reason"
              name="reason"
              maxLength={REASON_MAX}
              autoComplete="off"
              className={fieldClass}
            />
            <p className="text-muted text-sm">Everyone in the flat is told.</p>
          </div>
          <div>
            <Button type="submit" variant="secondary">
              Cancel the event
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
