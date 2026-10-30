// Kept free of server-only imports so it can be tested and used anywhere.

import { formatPence } from "./money";
import { simplifyDebts } from "./simplify";

export interface PersonPosition {
  profileId: string;
  displayName: string;
  /** Positive: owed money. Negative: owes money. */
  pence: number;
  /** Still in the flat. People who have left appear only while money is open. */
  current: boolean;
}

export type Standing = "owed" | "owes" | "square";

export interface PersonRow {
  profileId: string;
  displayName: string;
  /** Always positive: how much, in the direction `status` says. */
  pence: number;
  status: Standing;
  isYou: boolean;
}

export interface SuggestedPayment {
  fromId: string;
  toId: string;
  fromName: string;
  toName: string;
  pence: number;
  youPay: boolean;
  youReceive: boolean;
  involvesYou: boolean;
}

export interface BalancesView {
  summary: { kind: Standing; pence: number };
  /** Current flatmates: people owed money first, then people who owe, then those who are square. */
  people: PersonRow[];
  /** People who have left but still owe or are owed. */
  former: PersonRow[];
  payments: SuggestedPayment[];
  /** Nobody owes anybody anything. */
  settled: boolean;
  /** The balances did not add up to zero, which should be impossible; payments are withheld. */
  inconsistent: boolean;
}

function standing(pence: number): Standing {
  return pence > 0 ? "owed" : pence < 0 ? "owes" : "square";
}

const ORDER: Record<Standing, number> = { owed: 0, owes: 1, square: 2 };

function toRow(position: PersonPosition, viewerId: string): PersonRow {
  return {
    profileId: position.profileId,
    displayName: position.displayName,
    pence: Math.abs(position.pence),
    status: standing(position.pence),
    isYou: position.profileId === viewerId,
  };
}

const byStanding = (a: PersonRow, b: PersonRow) =>
  ORDER[a.status] - ORDER[b.status] ||
  b.pence - a.pence ||
  a.displayName.localeCompare(b.displayName);

/** Turns the database's balances into what the Money screen shows. */
export function buildBalancesView(positions: PersonPosition[], viewerId: string): BalancesView {
  const rows = positions.map((position) => ({ position, row: toRow(position, viewerId) }));
  const people = rows
    .filter(({ position }) => position.current)
    .map(({ row }) => row)
    .sort(byStanding);
  const former = rows
    .filter(({ position }) => !position.current && position.pence !== 0)
    .map(({ row }) => row)
    .sort(byStanding);

  const mine = positions.find((position) => position.profileId === viewerId)?.pence ?? 0;
  const names = new Map(positions.map((position) => [position.profileId, position.displayName]));

  let payments: SuggestedPayment[] = [];
  let inconsistent = false;
  try {
    payments = simplifyDebts(
      positions.map((position) => ({ profileId: position.profileId, pence: position.pence })),
    ).map((payment) => ({
      fromId: payment.from,
      toId: payment.to,
      fromName: names.get(payment.from) ?? "Someone",
      toName: names.get(payment.to) ?? "Someone",
      pence: payment.pence,
      youPay: payment.from === viewerId,
      youReceive: payment.to === viewerId,
      involvesYou: payment.from === viewerId || payment.to === viewerId,
    }));
  } catch {
    inconsistent = true;
  }

  return {
    summary: { kind: standing(mine), pence: Math.abs(mine) },
    people,
    former,
    payments,
    settled: positions.every((position) => position.pence === 0),
    inconsistent,
  };
}

/** "You pay Sam £12.00", "Sam pays you £12.00" or "Sam pays Kim £12.00". */
export function describePayment(payment: SuggestedPayment): string {
  const amount = formatPence(payment.pence);
  if (payment.youPay) return `You pay ${payment.toName} ${amount}`;
  if (payment.youReceive) return `${payment.fromName} pays you ${amount}`;
  return `${payment.fromName} pays ${payment.toName} ${amount}`;
}
