import { Suspense } from "react";

import { RequireFlat } from "@/features/household/require-flat";
import { getCalendar } from "@/features/events/calendar";
import {
  calendarNav,
  defaultRange,
  monthRange,
  parseMonthParam,
} from "@/features/events/calendar-model";
import { CalendarView } from "@/features/events/calendar-view";

export const metadata = { title: "Calendar | FlatMate" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

async function CalendarContent({ searchParams }: { searchParams: SearchParams }) {
  const now = new Date();
  // A bad or repeated ?month is ignored and the default view shows.
  const requested = parseMonthParam((await searchParams).month);
  const range = requested ? monthRange(requested) : defaultRange(now);
  const { model, missing } = await getCalendar(range);
  return (
    <CalendarView model={model} nav={calendarNav(now, requested)} now={now} missing={missing} />
  );
}

export default function CalendarPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={null}>
      <RequireFlat>
        <CalendarContent searchParams={searchParams} />
      </RequireFlat>
    </Suspense>
  );
}
