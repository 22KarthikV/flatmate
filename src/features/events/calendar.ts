import "server-only";

import { getMembership } from "@/features/household/membership";
import { getBillMonths } from "@/features/recurring/months";
import { getMyRent } from "@/features/recurring/rent";
import { addDays, availabilityDeadline, weekStartOf } from "@/features/rota/week";
import { getWeeks } from "@/features/rota/weeks";

import {
  buildCalendar,
  weekStartsIn,
  type CalendarBillInput,
  type CalendarChoreInput,
  type CalendarEventInput,
  type CalendarModel,
} from "./calendar-model";
import { getEvents } from "./events";

export interface CalendarResult {
  model: CalendarModel;
  /** Names of the blocks that could not be read. The page still renders without them. */
  missing: string[];
}

/**
 * Gathers the calendar for a London date range using only existing readers. Rent comes from
 * my_rent() (the caller's own rows) and is cut down to unpaid due dates here, so nothing but a
 * date goes any further. Each block that fails is left out instead of breaking the page.
 */
export async function getCalendar(range: { from: string; to: string }): Promise<CalendarResult> {
  const membership = await getMembership();
  const viewerId = membership?.profileId ?? "";
  const weekStarts = weekStartsIn(range);

  const [events, weeks, bills, rent] = await Promise.allSettled([
    getEvents(),
    getWeeks(weekStarts),
    getBillMonths(),
    getMyRent(),
  ]);

  const missing: string[] = [];
  const settled = <T>(result: PromiseSettledResult<T>, name: string): T | null => {
    if (result.status === "fulfilled") return result.value;
    missing.push(name);
    return null;
  };

  const eventRows = settled(events, "events");
  const weekRows = settled(weeks, "chores");
  const billRows = settled(bills, "bills");
  const rentRows = settled(rent, "rent");

  const eventInputs: CalendarEventInput[] = (eventRows ?? []).map((event) => ({
    id: event.id,
    title: event.title,
    location: event.location,
    status: event.status,
    startsAt: event.startsAt,
  }));
  const choreInputs: CalendarChoreInput[] = (weekRows ?? []).flatMap((week) =>
    week.assignments.map((a) => ({
      id: a.id,
      choreName: a.choreName,
      dueOn: a.dueOn,
      assigneeId: a.assigneeId,
      completedAt: a.completedAt,
    })),
  );
  const billInputs: CalendarBillInput[] = (billRows ?? []).map((bill) => ({
    id: bill.id,
    name: bill.name,
    dueOn: bill.dueOn,
    status: bill.status,
    voided: bill.voided,
  }));
  // Dates only: the amount, collector and status stay behind in this function.
  const ownRentDueDates = (rentRows ?? []).filter((r) => r.status !== "paid").map((r) => r.dueOn);

  const rotaDeadlines: string[] = [];
  for (let ws = weekStartOf(range.from); ws <= addDays(range.to, 8); ws = addDays(ws, 7)) {
    rotaDeadlines.push(availabilityDeadline(ws).toISOString());
  }

  return {
    model: buildCalendar({
      range,
      viewerId,
      events: eventInputs,
      chores: choreInputs,
      bills: billInputs,
      ownRentDueDates,
      rotaDeadlines,
    }),
    missing,
  };
}
