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

export interface TemplateDetail {
  id: string;
  kind: "rent" | "bill";
  name: string;
  paidById: string;
  paidByName: string;
  dueDay: number;
  amountMode: "fixed" | "variable";
  amountPence: number | null;
  splitMode: "equal" | "percent" | "amounts";
  activeMonths: number[];
  paused: boolean;
  pausedReason: "admin" | "member_left" | "payer_left" | null;
  ended: boolean;
  /** Who is on it: for rent, each person's pence and room; for a percentage bill, their share. */
  shares: {
    profileId: string;
    displayName: string;
    shareValue: number | null;
    roomId: string | null;
  }[];
  rooms: { id: string; name: string; rentPence: number }[];
  log: { id: string; change: string; createdAt: string; changedByName: string }[];
  /** Months already created or skipped, as yyyy-mm-dd periods. */
  months: { period: string; status: "awaiting_amount" | "posted" | "skipped" }[];
}

const DETAIL_COLUMNS = `
  id, kind, name, paid_by, due_day, amount_mode, amount_pence, split_mode, active_months,
  paused_at, paused_reason, ended_at,
  payer:profiles!recurring_templates_paid_by_fkey(display_name),
  shares:recurring_template_shares(profile_id, share_value, room_id, profile:profiles(display_name)),
  rooms:recurring_rooms(id, name, rent_pence),
  log:recurring_template_log(id, change, created_at, who:profiles(display_name)),
  months:recurring_instances(period, status)
`;

function toDetail(row: {
  id: string;
  kind: string;
  name: string;
  paid_by: string;
  due_day: number;
  amount_mode: string;
  amount_pence: number | null;
  split_mode: string;
  active_months: number[];
  paused_at: string | null;
  paused_reason: string | null;
  ended_at: string | null;
  payer: { display_name: string } | null;
  shares: {
    profile_id: string;
    share_value: number | null;
    room_id: string | null;
    profile: { display_name: string } | null;
  }[];
  rooms: { id: string; name: string; rent_pence: number }[];
  log: { id: string; change: string; created_at: string; who: { display_name: string } | null }[];
  months: { period: string; status: string }[];
}): TemplateDetail {
  return {
    id: row.id,
    kind: row.kind as TemplateDetail["kind"],
    name: row.name,
    paidById: row.paid_by,
    paidByName: row.payer?.display_name ?? "Someone",
    dueDay: row.due_day,
    amountMode: row.amount_mode as TemplateDetail["amountMode"],
    amountPence: row.amount_pence,
    splitMode: row.split_mode as TemplateDetail["splitMode"],
    activeMonths: row.active_months,
    paused: row.paused_at !== null,
    pausedReason: row.paused_reason as TemplateDetail["pausedReason"],
    ended: row.ended_at !== null,
    shares: row.shares
      .map((share) => ({
        profileId: share.profile_id,
        displayName: share.profile?.display_name ?? "Someone",
        shareValue: share.share_value,
        roomId: share.room_id,
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    rooms: row.rooms
      .map((room) => ({ id: room.id, name: room.name, rentPence: room.rent_pence }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    log: row.log
      .map((entry) => ({
        id: entry.id,
        change: entry.change,
        createdAt: entry.created_at,
        changedByName: entry.who?.display_name ?? "Someone",
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    months: row.months.map((month) => ({
      period: month.period,
      status: month.status as TemplateDetail["months"][number]["status"],
    })),
  };
}

/**
 * One template with its people, rooms, change log and months. Row-level security decides who can
 * see it: a rent template (and its rooms, shares and log) is readable by admins only, so a member
 * asking for one gets null, exactly as if it did not exist.
 */
export async function getTemplateDetail(id: string): Promise<TemplateDetail | null> {
  const { supabase } = await getRequestSession();
  const { data } = await supabase
    .from("recurring_templates")
    .select(DETAIL_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  return data ? toDetail(data) : null;
}

/** Rent templates still running or paused. Admins only: for anyone else this is empty. */
export async function getRentTemplates(): Promise<TemplateDetail[]> {
  const { supabase } = await getRequestSession();
  const { data } = await supabase
    .from("recurring_templates")
    .select(DETAIL_COLUMNS)
    .eq("kind", "rent")
    .is("ended_at", null)
    .order("name", { ascending: true });
  return (data ?? []).map(toDetail);
}
