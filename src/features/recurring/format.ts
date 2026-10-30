// Kept free of server-only imports so client components can use it.

import { MONTH_NAMES, MONTH_SHORT } from "./constants";

/** "6th", "22nd", "11th". */
export function ordinal(day: number): string {
  const tens = day % 100;
  if (tens >= 11 && tens <= 13) return `${day}th`;
  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}

/** "November 2026" from a period or any yyyy-mm-dd date. */
export function monthLabel(iso: string): string {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(iso);
  if (!match) return iso;
  return `${MONTH_NAMES[Number(match[2]) - 1] ?? match[2]} ${match[1]}`;
}

/** "12 Nov" from a yyyy-mm-dd date. */
export function shortDay(iso: string): string {
  const match = /^\d{4}-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  return `${Number(match[2])} ${MONTH_SHORT[Number(match[1]) - 1] ?? match[1]}`;
}

/** "every month", "10 months a year", or the months named when only a few apply. */
export function describeMonths(months: readonly number[]): string {
  if (months.length === 12) return "every month";
  if (months.length > 6) return `${months.length} months a year`;
  return months.map((month) => MONTH_SHORT[month - 1]).join(", ");
}

export interface ScheduleInput {
  dueDay: number;
  amountMode: "fixed" | "variable";
  activeMonths: readonly number[];
}

/** "Due on the 12th · amount changes each month · every month". */
export function describeSchedule(input: ScheduleInput): string {
  return [
    `Due on the ${ordinal(input.dueDay)}`,
    input.amountMode === "variable" ? "amount changes each month" : "same amount each month",
    describeMonths(input.activeMonths),
  ].join(" · ");
}

export type InstanceStatus = "awaiting_amount" | "posted" | "skipped";

export function instanceStatusLabel(status: InstanceStatus): string {
  switch (status) {
    case "awaiting_amount":
      return "Waiting for the amount";
    case "posted":
      return "Created";
    case "skipped":
      return "Skipped";
  }
}
