import "server-only";

import { getRequestSession } from "@/features/identity/session-claims";

export interface PushDevice {
  id: string;
  label: string;
  createdAt: string;
  /** Set when the push service last reported a problem with this device. */
  failedAt: string | null;
}

/** The signed-in person's own devices. The secret keys are not selectable from the browser role. */
export async function getPushDevices(): Promise<PushDevice[]> {
  const { supabase, claims } = await getRequestSession();
  if (!claims?.sub) return [];

  const { data } = await supabase
    .from("push_subscriptions")
    .select("id, user_agent, created_at, failed_at")
    .order("created_at", { ascending: false });

  return (data ?? []).map((row) => ({
    id: row.id,
    label: row.user_agent || "Unknown device",
    createdAt: row.created_at,
    failedAt: row.failed_at,
  }));
}
