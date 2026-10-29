import "server-only";

import { getRequestSession } from "@/features/identity/session-claims";

const FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/London",
});

/**
 * When the flat's working invite link stops working, as text for display, or null when there is
 * none. Only owners and admins can read invites (row-level security), so anyone else gets null.
 */
export async function getLiveInviteExpiry(): Promise<string | null> {
  const { supabase } = await getRequestSession();
  const { data } = await supabase
    .from("invites")
    .select("expires_at")
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  return data ? FORMAT.format(new Date(data.expires_at)) : null;
}
