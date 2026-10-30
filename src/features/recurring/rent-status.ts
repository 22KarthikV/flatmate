// Kept free of server-only imports so client components can use it. The numbers behind these
// labels (what is paid, pending and outstanding) come from the database; nothing is worked out here.

export type RentStatus = "paid" | "pending" | "part_paid" | "outstanding";

export function isRentStatus(value: unknown): value is RentStatus {
  return (
    value === "paid" || value === "pending" || value === "part_paid" || value === "outstanding"
  );
}

const LABELS: Record<RentStatus, string> = {
  paid: "Paid",
  pending: "Waiting to be confirmed",
  part_paid: "Part paid",
  outstanding: "Not paid yet",
};

export function rentStatusLabel(status: RentStatus): string {
  return LABELS[status];
}

/** One of the person's own months of rent. Only ever the signed-in person's: it comes from my_rent. */
export interface MyRentRow {
  chargeId: string;
  /** yyyy-mm-dd, the first of the month */
  period: string;
  dueOn: string;
  amountPence: number;
  coveredPence: number;
  pendingPence: number;
  outstandingPence: number;
  status: RentStatus;
  collectorId: string;
  collectorName: string;
}

/** One person's rent for a month, as admins and the collector see it. */
export interface DashboardRow {
  chargeId: string;
  profileId: string;
  displayName: string;
  stillInFlat: boolean;
  roomName: string | null;
  period: string;
  dueOn: string;
  amountPence: number;
  coveredPence: number;
  pendingPence: number;
  outstandingPence: number;
  status: RentStatus;
}

export interface RentPaymentRow {
  id: string;
  payerId: string;
  payerName: string;
  amountPence: number;
  createdAt: string;
  kind: "payment" | "waiver";
  /** A confirmed payment that an admin has reversed. */
  voided: boolean;
}

/** How much a person still owes across their own months: what "I paid my rent" may not exceed. */
export function totalOwed(rows: readonly { outstandingPence: number }[]): number {
  return rows.reduce((sum, row) => sum + row.outstandingPence, 0);
}

/** The month's rent at a glance for admins: how much is due, in, waiting and still out. */
export function summariseMonth(rows: readonly DashboardRow[]): {
  duePence: number;
  paidPence: number;
  pendingPence: number;
  outstandingPence: number;
  counts: Record<RentStatus, number>;
} {
  const counts: Record<RentStatus, number> = { paid: 0, pending: 0, part_paid: 0, outstanding: 0 };
  let duePence = 0;
  let paidPence = 0;
  let pendingPence = 0;
  let outstandingPence = 0;
  for (const row of rows) {
    counts[row.status] += 1;
    duePence += row.amountPence;
    paidPence += row.coveredPence;
    pendingPence += row.pendingPence;
    outstandingPence += row.outstandingPence;
  }
  return { duePence, paidPence, pendingPence, outstandingPence, counts };
}
