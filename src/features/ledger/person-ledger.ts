// Kept free of server-only imports so it can be tested and used anywhere.

import type { PersonRow, SuggestedPayment } from "./balance-view";

/** One row behind a person's balance: an expense they paid or share in, or a payment they are part of. */
export interface LedgerItem {
  kind: "expense" | "settlement";
  id: string;
  occurredOn: string;
  description: string;
  /** The payer of an expense, or the other person in a payment. */
  otherId: string;
  otherName: string;
  amountPence: number;
  /** The person's own share of an expense; 0 for a payment. */
  sharePence: number;
  /** What it adds to (positive) or takes from (negative) their balance, when it counts. */
  effectPence: number;
  /** Cancelled expenses and payments nobody confirmed do not count towards the balance. */
  counts: boolean;
  status: string;
}

export interface PersonLedgerRow {
  kind: string;
  item_id: string;
  occurred_on: string;
  description: string;
  other_id: string;
  other_name: string;
  amount_pence: number;
  share_pence: number;
  effect_pence: number;
  counts: boolean;
  status: string;
}

export function toLedgerItems(rows: PersonLedgerRow[]): LedgerItem[] {
  return rows.map((row) => ({
    kind: row.kind === "settlement" ? "settlement" : "expense",
    id: row.item_id,
    occurredOn: row.occurred_on,
    description: row.description,
    otherId: row.other_id,
    otherName: row.other_name,
    amountPence: row.amount_pence,
    sharePence: row.share_pence,
    effectPence: row.effect_pence,
    counts: row.counts,
    status: row.status,
  }));
}

/** What the counting items add up to. The database guarantees this equals the person's balance. */
export function ledgerTotal(items: LedgerItem[]): number {
  return items.reduce((sum, item) => (item.counts ? sum + item.effectPence : sum), 0);
}

/** A person's position as a signed number: positive when they are owed, negative when they owe. */
export function signedPence(row: PersonRow): number {
  return row.status === "owed" ? row.pence : row.status === "owes" ? -row.pence : 0;
}

/** The suggested payments that involve one person, either paying or being paid. */
export function paymentsFor(payments: SuggestedPayment[], profileId: string): SuggestedPayment[] {
  return payments.filter((payment) => payment.fromId === profileId || payment.toId === profileId);
}
