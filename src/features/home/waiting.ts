// Pure: what is waiting on the viewer, in the order the spec gives, capped for a phone screen.
// Kept free of server-only imports so it can be tested anywhere.

import { shortDay } from "@/features/recurring/format";

export const WAITING_CAP = 4;

export interface WaitingInput {
  /** The availability window for next week is open and the viewer has not answered. */
  availabilityOpen: boolean;
  /** Payments others say they made to the viewer. */
  payments: { id: string; otherName: string }[];
  /** Variable bills the viewer pays that still have no amount. */
  bills: { id: string; name: string; dueOn: string }[];
  /** Swaps asked of the viewer. */
  swaps: { id: string; fromName: string; choreName: string }[];
}

export interface WaitingItem {
  key: string;
  text: string;
  href: string;
}

export interface Waiting {
  items: WaitingItem[];
  /** How many more there are beyond the cap. */
  more: number;
}

export function buildWaiting(input: WaitingInput): Waiting {
  const all: WaitingItem[] = [];
  if (input.availabilityOpen) {
    all.push({
      key: "availability",
      text: "Say which days you're around next week. Closes Saturday 18:00",
      href: "/rota/availability",
    });
  }
  for (const payment of input.payments) {
    all.push({
      key: `payment-${payment.id}`,
      text: `${payment.otherName} says they paid you. Please confirm`,
      href: "/money",
    });
  }
  for (const bill of input.bills) {
    all.push({
      key: `bill-${bill.id}`,
      text: `Enter this month's ${bill.name} amount, due ${shortDay(bill.dueOn)}`,
      href: `/money/recurring/instances/${bill.id}/amount`,
    });
  }
  for (const swap of input.swaps) {
    all.push({
      key: `swap-${swap.id}`,
      text: `${swap.fromName} asked to swap ${swap.choreName} with you`,
      href: "/rota",
    });
  }
  return { items: all.slice(0, WAITING_CAP), more: Math.max(0, all.length - WAITING_CAP) };
}
