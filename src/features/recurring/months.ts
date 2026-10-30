import "server-only";

import { getRequestSession } from "@/features/identity/session-claims";

import type { InstanceStatus } from "./format";

export interface BillMonth {
  id: string;
  templateId: string;
  name: string;
  payerId: string;
  payerName: string;
  /** yyyy-mm-dd */
  dueOn: string;
  status: InstanceStatus;
  /** The ledger expense, once the month is created; null while waiting or when skipped. */
  expenseId: string | null;
  amountPence: number | null;
  /** The expense was cancelled in the ledger afterwards. */
  voided: boolean;
  sharers: { displayName: string; pence: number }[];
}

const COLUMNS = `
  id, template_id, due_on, status, expense_id,
  template:recurring_templates!inner(
    name, kind, paid_by,
    payer:profiles!recurring_templates_paid_by_fkey(display_name)
  ),
  expense:expenses(
    amount_pence, voided_at,
    shares:expense_shares(share_pence, profile:profiles(display_name))
  )
`;

const HISTORY_LIMIT = 120;

async function fetchMonths(options: { limit: number; id?: string }): Promise<BillMonth[]> {
  const { supabase } = await getRequestSession();
  let query = supabase
    .from("recurring_instances")
    .select(COLUMNS)
    .eq("template.kind", "bill")
    .order("due_on", { ascending: false })
    .limit(options.limit);
  if (options.id) query = query.eq("id", options.id);
  const { data } = await query;

  return (data ?? []).map((row) => ({
    id: row.id,
    templateId: row.template_id,
    name: row.template?.name ?? "Bill",
    payerId: row.template?.paid_by ?? "",
    payerName: row.template?.payer?.display_name ?? "Someone",
    dueOn: row.due_on,
    status: row.status as InstanceStatus,
    expenseId: row.expense_id,
    amountPence: row.expense?.amount_pence ?? null,
    voided: row.expense?.voided_at != null,
    sharers: (row.expense?.shares ?? [])
      .map((share) => ({
        displayName: share.profile?.display_name ?? "Someone",
        pence: share.share_pence,
      }))
      .sort((a, b) => b.pence - a.pence || a.displayName.localeCompare(b.displayName)),
  }));
}

/**
 * Bill months, newest due date first: what was due, what it came to, and who shared it. Rent is
 * never listed here: a rent template cannot be read by members, so its months drop out of the join.
 */
export async function getBillMonths(limit: number = HISTORY_LIMIT): Promise<BillMonth[]> {
  return fetchMonths({ limit });
}

/** One bill month by id, or null when it is not a bill month the caller can see. */
export async function getBillMonth(id: string): Promise<BillMonth | null> {
  return (await fetchMonths({ limit: 1, id }))[0] ?? null;
}
