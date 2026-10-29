"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/** How often to check in even if no message arrives, for example after a phone woke from sleep. */
const BACKSTOP_MS = 60_000;
/** Several changes at once (a join, a role change) become one refresh. */
const DEBOUNCE_MS = 300;

/**
 * Keeps whatever flat screen is open up to date. When anyone joins, leaves or changes role, the
 * server pages re-render in place, so nobody has to navigate away and back. Renders nothing.
 *
 * Realtime messages are the fast path; coming back to the tab and a slow timer cover the cases
 * where a phone dropped the connection. Realtime only delivers rows the person may see, so the
 * person who has just been removed hears nothing and catches up on return or on the timer.
 */
export function LiveFlat({ householdId }: { householdId: string }) {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    let channel: RealtimeChannel | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), DEBOUNCE_MS);
    };
    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };

    const supabase = createSupabaseBrowserClient();
    void (async () => {
      // Realtime checks row access as whoever it is told you are, so hand it your session first.
      // (This is only the access token for the connection; the server still decides what you see.)
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) supabase.realtime.setAuth(data.session.access_token);

      // No column filter: Realtime already delivers only rows this person may read (the
      // memberships select policy), which is their own flat. A filter on household_id is
      // rejected by Realtime ("invalid column for filter").
      channel = supabase
        .channel(`flat:${householdId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "memberships" }, refresh)
        .subscribe();
    })();

    document.addEventListener("visibilitychange", refreshIfVisible);
    const interval = setInterval(refreshIfVisible, BACKSTOP_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshIfVisible);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [householdId, router]);

  return null;
}
