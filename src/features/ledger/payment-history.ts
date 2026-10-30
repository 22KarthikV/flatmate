import "server-only";

import { getRequestSession } from "@/features/identity/session-claims";

import type { DecidedStatus, PaymentHistoryItem } from "./history";

const LIMIT = 300;

const COLUMNS = `
  id, amount_pence, status, from_profile, to_profile, confirmed_by, created_at, decided_at,
  payer:profiles!settlements_from_profile_fkey(display_name),
  receiver:profiles!settlements_to_profile_fkey(display_name),
  confirmer:profiles!settlements_confirmed_by_fkey(display_name)
`;

/** Every payment in the flat that has been decided, newest first. Row-level security limits them to the caller's flat. */
export async function getPaymentHistory(): Promise<PaymentHistoryItem[]> {
  const { supabase } = await getRequestSession();
  const { data } = await supabase
    .from("settlements")
    .select(COLUMNS)
    .neq("status", "pending")
    .order("decided_at", { ascending: false })
    .limit(LIMIT);

  return (data ?? []).map((row) => ({
    id: row.id,
    amountPence: row.amount_pence,
    status: row.status as DecidedStatus,
    fromId: row.from_profile,
    toId: row.to_profile,
    fromName: row.payer?.display_name ?? "Someone",
    toName: row.receiver?.display_name ?? "Someone",
    confirmedById: row.confirmed_by,
    confirmedByName: row.confirmer?.display_name ?? null,
    when: row.decided_at ?? row.created_at,
  }));
}
