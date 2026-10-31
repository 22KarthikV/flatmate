// Pure: bills due in the next 14 days and the next rota deadline, sorted by date.

import { shortDay } from "@/features/recurring/format";
import { addDays, availabilityDeadline, londonDate, upcomingWeekStart } from "@/features/rota/week";

export const COMING_UP_DAYS = 14;

export interface ComingUpBill {
  id: string;
  name: string;
  dueOn: string;
  status: string;
  voided: boolean;
}

export interface ComingUpItem {
  key: string;
  date: string;
  text: string;
  href: string;
}

export function buildComingUp(bills: readonly ComingUpBill[], now: Date): ComingUpItem[] {
  const today = londonDate(now);
  const last = addDays(today, COMING_UP_DAYS);
  const items: ComingUpItem[] = bills
    .filter((b) => b.status !== "skipped" && !b.voided && b.dueOn >= today && b.dueOn <= last)
    .map((b) => ({
      key: `bill-${b.id}`,
      date: b.dueOn,
      text: `${b.name} due ${shortDay(b.dueOn)}`,
      href: "/money/recurring/months",
    }));

  // The next availability deadline that has not passed yet.
  let weekStart = upcomingWeekStart(now);
  if (availabilityDeadline(weekStart) <= now) weekStart = addDays(weekStart, 7);
  const deadline = londonDate(availabilityDeadline(weekStart));
  if (deadline <= last) {
    items.push({
      key: "rota-deadline",
      date: deadline,
      text: `Rota availability closes ${shortDay(deadline)}, 18:00`,
      href: "/rota/availability",
    });
  }
  return items.sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
}
