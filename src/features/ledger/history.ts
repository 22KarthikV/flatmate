// Kept free of server-only imports so it can be tested and used anywhere.

import { formatPence } from "./money";

export type DecidedStatus = "confirmed" | "declined" | "cancelled";

export interface PaymentHistoryItem {
  id: string;
  amountPence: number;
  status: DecidedStatus;
  fromId: string;
  toId: string;
  fromName: string;
  toName: string;
  /** Who confirmed it, for a confirmed payment. */
  confirmedById: string | null;
  confirmedByName: string | null;
  /** When it was decided (an ISO timestamp). */
  when: string;
}

export interface PaymentHistoryText {
  headline: string;
  status: "Confirmed" | "Not confirmed" | "Cancelled";
  /** A short note, or null when there is nothing to add. */
  detail: string | null;
  involvesYou: boolean;
}

const STATUS = {
  confirmed: "Confirmed",
  declined: "Not confirmed",
  cancelled: "Cancelled",
} as const;

/** "Sam paid you £5.00", its outcome, and who confirmed it. */
export function describePaymentHistory(
  item: PaymentHistoryItem,
  viewerId: string,
): PaymentHistoryText {
  const amount = formatPence(item.amountPence);
  const headline =
    item.fromId === viewerId
      ? `You paid ${item.toName} ${amount}`
      : item.toId === viewerId
        ? `${item.fromName} paid you ${amount}`
        : `${item.fromName} paid ${item.toName} ${amount}`;

  let detail: string | null = null;
  if (item.status === "confirmed" && item.confirmedById) {
    const by = item.confirmedById === viewerId ? "you" : (item.confirmedByName ?? "someone");
    detail =
      item.confirmedById === item.toId
        ? `Confirmed by ${by}`
        : `Confirmed by ${by} for ${item.toName}, who had left`;
  }

  return {
    headline,
    status: STATUS[item.status],
    detail,
    involvesYou: item.fromId === viewerId || item.toId === viewerId,
  };
}
