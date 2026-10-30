import "server-only";

import { getMembers } from "@/features/household/members";
import { getRequestSession } from "@/features/identity/session-claims";

export interface BillTemplate {
  id: string;
  name: string;
  paidById: string;
  paidByName: string;
  /** 1 to 28 */
  dueDay: number;
  amountMode: "fixed" | "variable";
  amountPence: number | null;
  splitMode: "equal" | "percent";
  activeMonths: number[];
  paused: boolean;
  pausedReason: "admin" | "member_left" | "payer_left" | null;
  ended: boolean;
}

const COLUMNS = `
  id, name, paid_by, due_day, amount_mode, amount_pence, split_mode, active_months,
  paused_at, paused_reason, ended_at,
  payer:profiles!recurring_templates_paid_by_fkey(display_name)
`;

/** The flat's bill templates, running ones first. Everyone in the flat can read these; rent is not here. */
export async function getBillTemplates(): Promise<BillTemplate[]> {
  const { supabase } = await getRequestSession();
  const { data } = await supabase
    .from("recurring_templates")
    .select(COLUMNS)
    .eq("kind", "bill")
    .is("ended_at", null)
    .order("name", { ascending: true });

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    paidById: row.paid_by,
    paidByName: row.payer?.display_name ?? "Someone",
    dueDay: row.due_day,
    amountMode: row.amount_mode as BillTemplate["amountMode"],
    amountPence: row.amount_pence,
    splitMode: row.split_mode as BillTemplate["splitMode"],
    activeMonths: row.active_months,
    paused: row.paused_at !== null,
    pausedReason: row.paused_reason as BillTemplate["pausedReason"],
    ended: row.ended_at !== null,
  }));
}

export interface BillSharer {
  profileId: string;
  displayName: string;
  /** Hundredths of a percent for a percentage bill; null for an equal one. */
  basisPoints: number | null;
}

/**
 * Who shares a bill this month, by the same rule the monthly job uses: a percentage bill by its
 * listed people; an equal bill by the listed people still in the flat, or by everyone in the flat
 * when nobody is listed.
 */
export async function getBillSharers(
  templateId: string,
  splitMode: "equal" | "percent",
): Promise<BillSharer[]> {
  const { supabase } = await getRequestSession();
  const [{ data }, members] = await Promise.all([
    supabase
      .from("recurring_template_shares")
      .select("profile_id, share_value, profile:profiles(display_name)")
      .eq("template_id", templateId),
    getMembers(),
  ]);
  const names = new Map(members.map((member) => [member.profileId, member.displayName]));
  const rows = data ?? [];

  if (splitMode === "percent") {
    return rows
      .map((row) => ({
        profileId: row.profile_id,
        displayName: row.profile?.display_name ?? "Someone",
        basisPoints: row.share_value,
      }))
      .sort((a, b) => a.profileId.localeCompare(b.profileId));
  }
  const listed = rows.filter((row) => names.has(row.profile_id));
  const everyone = rows.length === 0 ? members.map((member) => member.profileId) : null;
  return (everyone ?? listed.map((row) => row.profile_id))
    .map((profileId) => ({
      profileId,
      displayName: names.get(profileId) ?? "Someone",
      basisPoints: null,
    }))
    .sort((a, b) => a.profileId.localeCompare(b.profileId));
}
