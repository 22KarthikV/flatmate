import Link from "next/link";

import { Card, CardLabel } from "@/components/ui/card";
import { londonDate, shortDate, weekdayName } from "@/features/rota/week";

import type { CalendarNav, CalendarModel } from "./calendar-model";

const linkClass =
  "border-line label-caps inline-flex min-h-11 items-center border px-4 underline-offset-4 hover:underline";

function dayHeading(date: string, today: string): string {
  const name = `${weekdayName(date).slice(0, 3)} ${shortDate(date)}`;
  return date === today ? `${name} (today)` : name;
}

/** The agenda: still-deciding strip, then confirmed events and the viewer's dates by day. */
export function CalendarView({
  model,
  nav,
  now,
  missing = [],
}: {
  model: CalendarModel;
  nav: CalendarNav;
  now: Date;
  missing?: string[];
}) {
  const today = londonDate(now);
  return (
    <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-8 px-4 py-10 sm:px-8">
      <header className="flex flex-col gap-2">
        <p className="label-caps text-muted">Together</p>
        <h1 className="font-display text-5xl sm:text-6xl">Calendar</h1>
        <p className="text-muted max-w-md">
          Confirmed events, your chores, bills and your own rent date in one place. No amounts.
        </p>
      </header>

      <nav aria-label="Calendar months" className="flex flex-wrap items-center gap-3">
        <Link href={nav.earlier.href} className={linkClass}>
          <span aria-hidden="true">&larr;&nbsp;</span>
          Earlier: {nav.earlier.label}
        </Link>
        <Link href={nav.later.href} className={linkClass}>
          Later: {nav.later.label}
          <span aria-hidden="true">&nbsp;&rarr;</span>
        </Link>
        {nav.reset ? (
          <Link href={nav.reset.href} className={linkClass}>
            {nav.reset.label}
          </Link>
        ) : null}
      </nav>

      {model.deciding.length > 0 ? (
        <Card aria-labelledby="calendar-deciding">
          <CardLabel id="calendar-deciding">Still deciding</CardLabel>
          <ul className="mt-3 flex flex-col">
            {model.deciding.map((event) => (
              <li key={event.id}>
                <Link
                  href={event.href}
                  className="border-line flex min-h-11 items-center border-t py-3 break-words underline underline-offset-4 first:border-t-0"
                >
                  {event.title}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <section aria-labelledby="calendar-agenda" className="flex flex-col gap-6">
        <h2 id="calendar-agenda" className="label-caps text-muted">
          {nav.title}
        </h2>

        {missing.length > 0 ? (
          <p className="text-muted text-sm" role="status">
            Some things could not be loaded just now ({missing.join(", ")}). Try again in a moment.
          </p>
        ) : null}

        {model.empty ? (
          <Card>
            <CardLabel>Nothing planned</CardLabel>
            <p className="mt-3 text-lg">Nothing planned for this stretch.</p>
            <p className="text-muted mt-2 max-w-md text-sm">
              Confirmed events and due dates will appear here.
            </p>
          </Card>
        ) : (
          model.days.map((day) => (
            <div key={day.date} className="flex flex-col gap-2">
              <h3 className="font-display text-2xl">{dayHeading(day.date, today)}</h3>
              <ul className="border-line flex flex-col border-t">
                {day.items.map((item) => (
                  <li key={item.key} className="border-line border-b">
                    <Link
                      href={item.href}
                      className="flex min-h-11 min-w-0 flex-col justify-center gap-1 py-3 underline-offset-4 hover:underline"
                    >
                      <span className="label-caps text-muted">
                        {item.label}
                        {item.time ? ` · ${item.time}` : ""}
                      </span>
                      <span className="break-words">{item.title}</span>
                      {item.place || item.note ? (
                        <span className="text-muted text-sm break-words">
                          {[item.place, item.note].filter(Boolean).join(" · ")}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
