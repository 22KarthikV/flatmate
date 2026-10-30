import "server-only";

import { getRequestSession } from "@/features/identity/session-claims";

export interface ExpenseRow {
  id: string;
  description: string;
  category: string;
  amountPence: number;
  /** yyyy-mm-dd */
  occurredOn: string;
  createdAt: string;
  paidById: string;
  paidByName: string;
  createdById: string;
  voided: boolean;
  /** Voided because a corrected version replaced it (as opposed to being cancelled). */
  replaced: boolean;
  /** What the signed-in person owes towards it; null when they have no share. */
  myShare: number | null;
}

const LIST_LIMIT = 50;

const COLUMNS = `
  id, description, category, amount_pence, occurred_on, created_at, paid_by, created_by,
  voided_at, replaces_id,
  payer:profiles!expenses_paid_by_fkey(display_name),
  shares:expense_shares(profile_id, share_pence)
`;

/** The flat's latest expenses, newest first. Row-level security limits them to the caller's flat. */
export async function getRecentExpenses(viewerId: string): Promise<ExpenseRow[]> {
  const { supabase } = await getRequestSession();
  const { data } = await supabase
    .from("expenses")
    .select(COLUMNS)
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);

  const rows = data ?? [];
  // An expense is "replaced" when another row in the list says it replaces it.
  const replacedIds = new Set(rows.flatMap((row) => (row.replaces_id ? [row.replaces_id] : [])));

  return rows.map((row) => ({
    id: row.id,
    description: row.description,
    category: row.category,
    amountPence: row.amount_pence,
    occurredOn: row.occurred_on,
    createdAt: row.created_at,
    paidById: row.paid_by,
    paidByName: row.payer?.display_name ?? "Someone",
    createdById: row.created_by,
    voided: row.voided_at !== null,
    replaced: replacedIds.has(row.id),
    myShare: row.shares.find((share) => share.profile_id === viewerId)?.share_pence ?? null,
  }));
}

export interface ExpenseShareRow {
  profileId: string;
  displayName: string;
  pence: number;
}

export interface ExpenseVersion {
  id: string;
  description: string;
  amountPence: number;
  createdAt: string;
  createdByName: string;
  voided: boolean;
}

export interface ExpenseDetail extends ExpenseRow {
  createdByName: string;
  voidedByName: string | null;
  shares: ExpenseShareRow[];
  /** Earlier and later versions of this expense, oldest first, including this one. */
  history: ExpenseVersion[];
}

const DETAIL_COLUMNS = `
  id, description, category, amount_pence, occurred_on, created_at, paid_by, created_by,
  voided_at, replaces_id,
  payer:profiles!expenses_paid_by_fkey(display_name),
  creator:profiles!expenses_created_by_fkey(display_name),
  voider:profiles!expenses_voided_by_fkey(display_name),
  shares:expense_shares(profile_id, share_pence, profile:profiles(display_name))
`;

const VERSION_COLUMNS = `
  id, description, amount_pence, created_at, voided_at, replaces_id,
  creator:profiles!expenses_created_by_fkey(display_name)
`;

// A chain of corrections is short in practice; the cap only guards against a cycle.
const MAX_CHAIN = 20;

/** One expense with its shares and its correction history, or null when it is not in the caller's flat. */
export async function getExpense(id: string, viewerId: string): Promise<ExpenseDetail | null> {
  const { supabase } = await getRequestSession();
  const { data: row } = await supabase
    .from("expenses")
    .select(DETAIL_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (!row) return null;

  const toVersion = (v: {
    id: string;
    description: string;
    amount_pence: number;
    created_at: string;
    voided_at: string | null;
    creator: { display_name: string } | null;
  }): ExpenseVersion => ({
    id: v.id,
    description: v.description,
    amountPence: v.amount_pence,
    createdAt: v.created_at,
    createdByName: v.creator?.display_name ?? "Someone",
    voided: v.voided_at !== null,
  });

  // Walk back through what this replaced, then forward through what replaced it.
  const earlier: ExpenseVersion[] = [];
  let parentId = row.replaces_id;
  for (let step = 0; parentId && step < MAX_CHAIN; step++) {
    const { data: parent } = await supabase
      .from("expenses")
      .select(VERSION_COLUMNS)
      .eq("id", parentId)
      .maybeSingle();
    if (!parent) break;
    earlier.unshift(toVersion(parent));
    parentId = parent.replaces_id;
  }

  const later: ExpenseVersion[] = [];
  let childOf = row.id;
  let replaced = false;
  for (let step = 0; step < MAX_CHAIN; step++) {
    const { data: child } = await supabase
      .from("expenses")
      .select(VERSION_COLUMNS)
      .eq("replaces_id", childOf)
      .maybeSingle();
    if (!child) break;
    if (childOf === row.id) replaced = true;
    later.push(toVersion(child));
    childOf = child.id;
  }

  const shares = row.shares
    .map((share) => ({
      profileId: share.profile_id,
      displayName: share.profile?.display_name ?? "Someone",
      pence: share.share_pence,
    }))
    .sort((a, b) => b.pence - a.pence || a.displayName.localeCompare(b.displayName));

  return {
    id: row.id,
    description: row.description,
    category: row.category,
    amountPence: row.amount_pence,
    occurredOn: row.occurred_on,
    createdAt: row.created_at,
    paidById: row.paid_by,
    paidByName: row.payer?.display_name ?? "Someone",
    createdById: row.created_by,
    createdByName: row.creator?.display_name ?? "Someone",
    voided: row.voided_at !== null,
    voidedByName: row.voider?.display_name ?? null,
    replaced,
    myShare: shares.find((share) => share.profileId === viewerId)?.pence ?? null,
    shares,
    history: [...earlier, toVersion(row), ...later],
  };
}
