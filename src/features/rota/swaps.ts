import "server-only";

import { getRequestSession } from "@/features/identity/session-claims";

import { addDays } from "./week";

export interface PendingSwap {
  id: string;
  assignmentId: string;
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  choreName: string;
  dueOn: string;
  inReturn: { choreName: string; dueOn: string } | null;
}

const COLUMNS = `
  id, assignment_id, from_profile, to_profile,
  assignment:chore_assignments!swap_requests_assignment_id_fkey(chore_name, due_on),
  in_return:chore_assignments!swap_requests_in_return_id_fkey(chore_name, due_on),
  sender:profiles!swap_requests_from_profile_fkey(display_name),
  receiver:profiles!swap_requests_to_profile_fkey(display_name)
`;

/** Open swap requests in the flat (row-level security limits them), oldest first. */
export async function getPendingSwaps(): Promise<PendingSwap[]> {
  const { supabase } = await getRequestSession();
  const { data } = await supabase
    .from("swap_requests")
    .select(COLUMNS)
    .eq("status", "pending")
    .order("created_at");

  return (data ?? []).flatMap((row) =>
    row.assignment
      ? [
          {
            id: row.id,
            assignmentId: row.assignment_id,
            fromId: row.from_profile,
            fromName: row.sender?.display_name ?? "Someone",
            toId: row.to_profile,
            toName: row.receiver?.display_name ?? "Someone",
            choreName: row.assignment.chore_name,
            dueOn: row.assignment.due_on,
            inReturn: row.in_return
              ? { choreName: row.in_return.chore_name, dueOn: row.in_return.due_on }
              : null,
          },
        ]
      : [],
  );
}

/** "profileId:date" for every day someone in the flat is away during a week. */
export async function getAwayDays(weekStart: string): Promise<Set<string>> {
  const { supabase } = await getRequestSession();
  const { data } = await supabase
    .from("availability")
    .select("profile_id, on_date")
    .eq("available", false)
    .gte("on_date", weekStart)
    .lte("on_date", addDays(weekStart, 6));
  return new Set((data ?? []).map((row) => `${row.profile_id}:${row.on_date}`));
}
