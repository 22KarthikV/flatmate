import "server-only";

import { getMembers } from "@/features/household/members";
import { getMembership } from "@/features/household/membership";
import { getRequestSession } from "@/features/identity/session-claims";

import { buildEventView, type EventRow, type EventView } from "./event-model";

const COLUMNS = `
  id, title, description, location, status, organiser_id, vote_deadline, tiebreak_since,
  confirmed_option_id, starts_at, ends_at, cancelled_by, cancelled_reason
`;

type Client = Awaited<ReturnType<typeof getRequestSession>>["supabase"];

/**
 * Events with their dates and answers. Three plain reads, because an event and its dates are joined
 * twice (the date list and the confirmed date), which an embedded select cannot tell apart.
 * Row-level security limits every read to the caller's flat.
 */
async function loadRows(
  supabase: Client,
  events: { id: string }[],
): Promise<Pick<EventRow, "id" | "options" | "votes">[]> {
  const ids = events.map((event) => event.id);
  if (ids.length === 0) return [];
  const [options, votes] = await Promise.all([
    supabase
      .from("event_options")
      .select("id, event_id, starts_at, ends_at, removed_at")
      .in("event_id", ids),
    supabase
      .from("event_votes")
      .select("option_id, event_id, profile_id, answer")
      .in("event_id", ids),
  ]);
  return ids.map((id) => ({
    id,
    options: (options.data ?? []).filter((option) => option.event_id === id),
    votes: (votes.data ?? []).filter((vote) => vote.event_id === id) as EventRow["votes"],
  }));
}

function assemble(
  events: Omit<EventRow, "options" | "votes">[],
  rest: Pick<EventRow, "id" | "options" | "votes">[],
): EventRow[] {
  return events.map((event) => {
    const extra = rest.find((row) => row.id === event.id);
    return { ...event, options: extra?.options ?? [], votes: extra?.votes ?? [] };
  });
}

/** Every event of the caller's flat, as the screens show them. */
export async function getEvents(): Promise<EventView[]> {
  const membership = await getMembership();
  if (!membership) return [];
  const { supabase } = await getRequestSession();
  const [members, { data }] = await Promise.all([
    getMembers(),
    supabase.from("events").select(COLUMNS).order("created_at", { ascending: false }).limit(200),
  ]);
  const events = (data ?? []) as unknown as Omit<EventRow, "options" | "votes">[];
  const rows = assemble(events, await loadRows(supabase, events));
  return rows.map((row) => buildEventView(row, members, membership.profileId));
}

/** One event, or null when it does not exist or belongs to another flat. */
export async function getEvent(id: string): Promise<EventView | null> {
  const membership = await getMembership();
  if (!membership) return null;
  const { supabase } = await getRequestSession();
  const [members, { data }] = await Promise.all([
    getMembers(),
    supabase.from("events").select(COLUMNS).eq("id", id).maybeSingle(),
  ]);
  if (!data) return null;
  const event = data as unknown as Omit<EventRow, "options" | "votes">;
  const [row] = assemble([event], await loadRows(supabase, [event]));
  return buildEventView(row!, members, membership.profileId);
}
