// Use between readings, as a pure function with no database view. Calendar dates only, so clock
// changes cannot move a day count.

export interface Reading {
  id: string;
  /** yyyy-mm-dd */
  readOn: string;
  value: number;
  isReset: boolean;
  voided: boolean;
}

export interface Usage {
  fromId: string;
  toId: string;
  from: string;
  to: string;
  days: number;
  used: number;
  perDay: number;
}

const DAY_MS = 86_400_000;
const dayNumber = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);

/**
 * Use between each pair of neighbouring live readings, oldest first. A cancelled reading is
 * ignored, and nothing is worked out across a reading marked as a reset (new or rolled-over meter).
 */
export function usageBetween(readings: Reading[]): Usage[] {
  const live = readings
    .filter((reading) => !reading.voided)
    .sort((a, b) => (a.readOn < b.readOn ? -1 : a.readOn > b.readOn ? 1 : 0));

  const gaps: Usage[] = [];
  for (let i = 1; i < live.length; i++) {
    const a = live[i - 1];
    const b = live[i];
    if (b.isReset) continue;
    const days = dayNumber(b.readOn) - dayNumber(a.readOn);
    if (days <= 0) continue;
    // Thousandths, so decimals add up exactly.
    const used = Math.round((b.value - a.value) * 1000) / 1000;
    gaps.push({
      fromId: a.id,
      toId: b.id,
      from: a.readOn,
      to: b.readOn,
      days,
      used,
      perDay: used / days,
    });
  }
  return gaps;
}

/** 214, 214.5, 0.125: up to three decimals, no trailing zeros. */
export function formatAmount(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

export function unitLabel(unit: string): string {
  return unit === "m3" ? "m³" : unit;
}

function perDayText(perDay: number): string {
  if (perDay >= 5) return String(Math.round(perDay));
  if (perDay >= 1) return String(Math.round(perDay * 10) / 10);
  return String(Math.round(perDay * 100) / 100);
}

/** "Used 214 kWh in 31 days, about 7 a day." */
export function usageText(gap: Usage, unit: string): string {
  return `Used ${formatAmount(gap.used)} ${unitLabel(unit)} in ${gap.days} day${
    gap.days === 1 ? "" : "s"
  }, about ${perDayText(gap.perDay)} a day.`;
}
