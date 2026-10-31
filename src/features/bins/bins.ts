import "server-only";

import { getRequestSession } from "@/features/identity/session-claims";

import type { BinException, BinStream } from "./collections";

export interface BinExceptionRow extends BinException {
  id: string;
}

/** The flat's active bins and their exceptions. Row-level security limits both to the caller's flat. */
export async function getBins(): Promise<{ streams: BinStream[]; exceptions: BinExceptionRow[] }> {
  const { supabase } = await getRequestSession();
  const [streams, exceptions] = await Promise.all([
    supabase
      .from("bin_streams")
      .select("id, name, colour, anchor_on, every_weeks")
      .is("archived_at", null)
      .order("name"),
    supabase
      .from("bin_exceptions")
      .select("id, stream_id, original_on, kind, moved_to, note")
      .order("original_on"),
  ]);

  const active = new Set((streams.data ?? []).map((row) => row.id));
  return {
    streams: (streams.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      colour: row.colour,
      anchorOn: row.anchor_on,
      everyWeeks: row.every_weeks,
    })),
    exceptions: (exceptions.data ?? [])
      .filter((row) => active.has(row.stream_id))
      .map((row) => ({
        id: row.id,
        streamId: row.stream_id,
        originalOn: row.original_on,
        kind: row.kind as "skip" | "move",
        movedTo: row.moved_to,
        note: row.note,
      })),
  };
}
