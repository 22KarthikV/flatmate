import "server-only";

import { getMembers } from "@/features/household/members";
import { getRequestSession } from "@/features/identity/session-claims";

export interface PendingSettlement {
  id: string;
  amountPence: number;
  createdAt: string;
  /** The other person: who paid you, or who you paid. */
  otherName: string;
  /** For payments you sent: the person you paid has left the flat, so an admin decides it. */
  receiverLeft?: boolean;
}

export interface OnBehalfSettlement {
  id: string;
  amountPence: number;
  createdAt: string;
  payerName: string;
  receiverName: string;
}

export interface PendingSettlements {
  /** Others say they paid you; you decide. */
  toConfirm: PendingSettlement[];
  /** You say you paid; they decide. */
  sent: PendingSettlement[];
  /** Payments to someone who has left; you are an admin and not the payer, so you decide for them. */
  onBehalf: OnBehalfSettlement[];
}

/** Payments still waiting for a decision that involve the signed-in person, or that they may decide for someone who left. */
export async function getPendingSettlements(
  viewerId: string,
  viewerIsAdmin: boolean,
): Promise<PendingSettlements> {
  const { supabase } = await getRequestSession();
  const [{ data }, members] = await Promise.all([
    supabase
      .from("settlements")
      .select(
        `id, amount_pence, created_at, from_profile, to_profile,
         payer:profiles!settlements_from_profile_fkey(display_name),
         receiver:profiles!settlements_to_profile_fkey(display_name)`,
      )
      .eq("status", "pending")
      .order("created_at", { ascending: true }),
    getMembers(),
  ]);
  const active = new Set(members.map((member) => member.profileId));

  const result: PendingSettlements = { toConfirm: [], sent: [], onBehalf: [] };
  for (const row of data ?? []) {
    const receiverLeft = !active.has(row.to_profile);
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
        receiverLeft,
      });
    } else if (viewerIsAdmin && receiverLeft) {
      result.onBehalf.push({
        id: row.id,
        amountPence: row.amount_pence,
        createdAt: row.created_at,
        payerName: row.payer?.display_name ?? "Someone",
        receiverName: row.receiver?.display_name ?? "Someone",
      });
    }
  }
  return result;
}
