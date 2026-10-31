// Pure and free of server-only imports so it can be tested and used anywhere.

import type { SuggestedPayment } from "@/features/ledger/balance-view";

/** Rent the viewer still owes one collector, summed over the months. */
export interface RentIOwe {
  collectorId: string;
  collectorName: string;
  outstandingPence: number;
  /** Said to be paid, waiting for the collector to confirm. */
  pendingPence: number;
}

/** Rent one person still owes the viewer, who collects it. */
export interface RentOwedToMe {
  payerId: string;
  payerName: string;
  outstandingPence: number;
  pendingPence: number;
}

export interface TotalsLine {
  profileId: string;
  name: string;
  rentPence: number;
  /** Bills and expenses: the fewest payments that would square the flat up. */
  billsPence: number;
  totalPence: number;
}

export interface TotalsSide {
  totalPence: number;
  /** Rent said to be paid but not yet confirmed. Not in the total. */
  pendingRentPence: number;
  lines: TotalsLine[];
}

export interface Totals {
  owe: TotalsSide;
  owed: TotalsSide;
}

function side(
  bills: { profileId: string; name: string; pence: number }[],
  rent: { profileId: string; name: string; outstanding: number; pending: number }[],
): TotalsSide {
  const byPerson = new Map<string, TotalsLine>();
  const line = (profileId: string, name: string): TotalsLine => {
    let existing = byPerson.get(profileId);
    if (!existing) {
      existing = { profileId, name, rentPence: 0, billsPence: 0, totalPence: 0 };
      byPerson.set(profileId, existing);
    }
    return existing;
  };
  for (const item of bills) line(item.profileId, item.name).billsPence += item.pence;
  for (const item of rent) line(item.profileId, item.name).rentPence += item.outstanding;

  const lines = [...byPerson.values()]
    .map((l) => ({ ...l, totalPence: l.rentPence + l.billsPence }))
    .filter((l) => l.totalPence > 0)
    .sort((a, b) => b.totalPence - a.totalPence || a.name.localeCompare(b.name));
  return {
    totalPence: lines.reduce((sum, l) => sum + l.totalPence, 0),
    pendingRentPence: rent.reduce((sum, r) => sum + r.pending, 0),
    lines,
  };
}

/**
 * What the viewer owes and is owed, per person, with rent and bills and expenses together. The two
 * directions are never netted against each other: rent is its own ledger, so owing one person rent
 * and being owed bills by them stays two numbers.
 */
export function buildTotals(input: {
  payments: SuggestedPayment[];
  rentIOwe: RentIOwe[];
  rentOwedToMe: RentOwedToMe[];
}): Totals {
  return {
    owe: side(
      input.payments
        .filter((p) => p.youPay)
        .map((p) => ({ profileId: p.toId, name: p.toName, pence: p.pence })),
      input.rentIOwe.map((r) => ({
        profileId: r.collectorId,
        name: r.collectorName,
        outstanding: r.outstandingPence,
        pending: r.pendingPence,
      })),
    ),
    owed: side(
      input.payments
        .filter((p) => p.youReceive)
        .map((p) => ({ profileId: p.fromId, name: p.fromName, pence: p.pence })),
      input.rentOwedToMe.map((r) => ({
        profileId: r.payerId,
        name: r.payerName,
        outstanding: r.outstandingPence,
        pending: r.pendingPence,
      })),
    ),
  };
}
