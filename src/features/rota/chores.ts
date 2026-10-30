import "server-only";

import { getRequestSession } from "@/features/identity/session-claims";

import type { Cadence, Chore } from "./constants";

/** The flat's chores by name, with their checklists. Row-level security limits them to the caller's flat. */
export async function getChores(options: { includeArchived?: boolean } = {}): Promise<Chore[]> {
  const { supabase } = await getRequestSession();
  let query = supabase
    .from("chores")
    .select(
      "id, name, cadence, preferred_dow, every_n_days, effort, needs_signoff, archived_at, items:chore_checklist_items(id, position, text)",
    )
    .order("name");
  if (!options.includeArchived) query = query.is("archived_at", null);
  const { data } = await query;

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    cadence: row.cadence as Cadence,
    preferredDow: row.preferred_dow,
    everyNDays: row.every_n_days,
    effort: row.effort,
    needsSignoff: row.needs_signoff,
    archived: row.archived_at !== null,
    items: [...row.items].sort((a, b) => a.position - b.position),
  }));
}
