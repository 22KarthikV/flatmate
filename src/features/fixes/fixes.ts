import "server-only";

import { getRequestSession } from "@/features/identity/session-claims";

import type { FixStatus } from "./constants";
import type { FixReport, FixUpdate } from "./view";

const COLUMNS =
  "id, title, details, location, status, reported_by, chaser_id, created_at, last_activity_at, reporter:profiles!fix_reports_reported_by_fkey(display_name), chaser:profiles!fix_reports_chaser_id_fkey(display_name)";

type Row = {
  id: string;
  title: string;
  details: string | null;
  location: string | null;
  status: string;
  reported_by: string;
  chaser_id: string | null;
  created_at: string;
  last_activity_at: string;
  reporter: { display_name: string } | null;
  chaser: { display_name: string } | null;
};

function toReport(row: Row): FixReport {
  return {
    id: row.id,
    title: row.title,
    details: row.details,
    location: row.location,
    status: row.status as FixStatus,
    reportedBy: row.reported_by,
    reporterName: row.reporter?.display_name ?? "Someone",
    chaserId: row.chaser_id,
    chaserName: row.chaser?.display_name ?? null,
    createdAt: row.created_at,
    lastActivityAt: row.last_activity_at,
  };
}

/** The flat's reports. Row-level security hides other flats' and hidden reports. */
export async function getReports(): Promise<FixReport[]> {
  const { supabase } = await getRequestSession();
  const { data } = await supabase
    .from("fix_reports")
    .select(COLUMNS)
    .order("created_at", { ascending: false })
    .limit(300);
  return (data ?? []).map((row) => toReport(row as Row));
}

/** One report with its timeline, oldest first; null when it is not in the caller's flat. */
export async function getReport(
  id: string,
): Promise<{ report: FixReport; updates: FixUpdate[] } | null> {
  const { supabase } = await getRequestSession();
  const { data } = await supabase.from("fix_reports").select(COLUMNS).eq("id", id).maybeSingle();
  if (!data) return null;
  const { data: updates } = await supabase
    .from("fix_updates")
    .select("id, kind, body, created_at, author:profiles!fix_updates_author_id_fkey(display_name)")
    .eq("report_id", id)
    .order("created_at", { ascending: true });

  return {
    report: toReport(data as Row),
    updates: (updates ?? []).map((u) => ({
      id: u.id,
      kind: u.kind as FixUpdate["kind"],
      body: u.body,
      authorName: u.author?.display_name ?? "Someone",
      createdAt: u.created_at,
    })),
  };
}
