import "server-only";

import { getRequestSession } from "@/features/identity/session-claims";

export interface PendingSettlement {
  id: string;
  amountPence: number;
  createdAt: string;
  /** The other person: who paid you, or who you paid. */
  otherName: string;
}

export interface PendingSettlements {
  /** Others say they paid you; you decide. */
  toConfirm: PendingSettlement[];
  /** You say you paid; they decide. */
  sent: PendingSettlement[];
}

/** Payments still waiting for a decision that involve the signed-in person. */
export async function getPendingSettlements(viewerId: string): Promise<PendingSettlements> {
  const { supabase } = await getRequestSession();
  const { data } = await supabase
    .from("settlements")
    .select(
      `id, amount_pence, created_at, from_profile, to_profile,
       payer:profiles!settlements_from_profile_fkey(display_name),
       receiver:profiles!settlements_to_profile_fkey(display_name)`,
    )
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  const result: PendingSettlements = { toConfirm: [], sent: [] };
  for (const row of data ?? []) {
    if (row.to_profile === viewerId) {
      result.toConfirm.push({
        id: row.id,
        amountPence: row.amount_pence,
        createdAt: row.created_at,
        otherName: row.payer?.display_name ?? "Someone",
      });
    } else if (row.from_profile === viewerId) {
      result.sent.push({
        id: row.id,
        amountPence: row.amount_pence,
        createdAt: row.created_at,
        otherName: row.receiver?.display_name ?? "Someone",
      });
    }
  }
  return result;
}
