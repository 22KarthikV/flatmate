import "server-only";

import { getRequestSession } from "@/features/identity/session-claims";

import {
  isRentStatus,
  type DashboardRow,
  type MyRentRow,
  type RentPaymentRow,
  type RentStatus,
} from "./rent-status";

const status = (value: string): RentStatus => (isRentStatus(value) ? value : "outstanding");

/**
 * The signed-in person's own months of rent, newest first. The database function derives the
 * person from their sign-in and has no argument to point at anyone else, so this can only ever
 * return their own rows.
 */
export async function getMyRent(): Promise<MyRentRow[]> {
  const { supabase } = await getRequestSession();
  const { data } = await supabase.rpc("my_rent");
  return (data ?? []).map((row) => ({
    chargeId: row.charge_id,
    period: row.period,
    dueOn: row.due_on,
    amountPence: row.amount_pence,
    coveredPence: row.covered_pence,
    pendingPence: row.pending_pence,
    outstandingPence: row.outstanding_pence,
    status: status(row.status),
    collectorId: row.collector_id,
    collectorName: row.collector_name,
  }));
}

/** Everyone's rent for one month. Owners and admins only: the database refuses anyone else. */
export async function getRentDashboard(period: string): Promise<DashboardRow[]> {
  const { supabase } = await getRequestSession();
  const { data } = await supabase.rpc("rent_dashboard", { p_period: period });
  return (data ?? []).map((row) => ({
    chargeId: row.charge_id,
    profileId: row.profile_id,
    displayName: row.display_name,
    stillInFlat: row.still_in_flat,
    roomName: row.room_name,
    period: row.period,
    dueOn: row.due_on,
    amountPence: row.amount_pence,
    coveredPence: row.covered_pence,
    pendingPence: row.pending_pence,
    outstandingPence: row.outstanding_pence,
    status: status(row.status),
  }));
}

const PAYMENT_COLUMNS = `
  id, payer_id, amount_pence, created_at, kind, voided_at,
  payer:profiles!rent_payments_payer_id_fkey(display_name)
`;

function toPayment(row: {
  id: string;
  payer_id: string;
  amount_pence: number;
  created_at: string;
  kind: string;
  voided_at: string | null;
  payer: { display_name: string } | null;
}): RentPaymentRow {
  return {
    id: row.id,
    payerId: row.payer_id,
    payerName: row.payer?.display_name ?? "Someone",
    amountPence: row.amount_pence,
    createdAt: row.created_at,
    kind: row.kind === "waiver" ? "waiver" : "payment",
    voided: row.voided_at !== null,
  };
}

/**
 * Rent payments waiting for a decision. Row-level security shows an admin everyone's and a member
 * only their own, so the same call serves both screens.
 */
export async function getPendingRentPayments(): Promise<RentPaymentRow[]> {
  const { supabase } = await getRequestSession();
  const { data } = await supabase
    .from("rent_payments")
    .select(PAYMENT_COLUMNS)
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  return (data ?? []).map(toPayment);
}

/** The latest confirmed payments and waivers, newest first, for an admin to review or reverse. */
export async function getRecentConfirmedPayments(limit = 10): Promise<RentPaymentRow[]> {
  const { supabase } = await getRequestSession();
  const { data } = await supabase
    .from("rent_payments")
    .select(PAYMENT_COLUMNS)
    .eq("status", "confirmed")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map(toPayment);
}

/** Months that have a rent charge, newest first, as yyyy-mm-dd periods (admins: the picker). */
export async function getRentPeriods(): Promise<string[]> {
  const { supabase } = await getRequestSession();
  const { data } = await supabase
    .from("recurring_instances")
    .select("period, template:recurring_templates!inner(kind)")
    .eq("template.kind", "rent")
    .neq("status", "skipped")
    .order("period", { ascending: false })
    .limit(24);
  return [...new Set((data ?? []).map((row) => row.period))];
}
