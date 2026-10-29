"use client";

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** How often to check in even if no message arrives, for example after a phone woke from sleep. */
const BACKSTOP_MS = 60_000;
/** Several notifications at once (a join and a role change) become one refresh. */
const DEBOUNCE_MS = 300;

/**
 * Keeps the bell and an open inbox up to date. When a notification arrives for this person, the
 * server components re-render in place, so the count rises without navigating. Renders nothing.
 *
 * Same approach as LiveFlat: Realtime is the fast path; coming back to the tab and a slow timer
 * cover a dropped connection. Realtime only delivers rows the person may read, which is their own
 * notifications (the select policy), so nobody hears about anyone else's.
 */
export function LiveInbox() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    let supabase: SupabaseClient | undefined;
    let channel: RealtimeChannel | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), DEBOUNCE_MS);
    };
    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };

    void (async () => {
      // Loaded after the page is up, so the Supabase client is not part of the initial download
      // of every screen (see scripts/bundle-budgets.json).
      const { createSupabaseBrowserClient } = await import("@/lib/supabase/browser");
      if (cancelled) return;
      supabase = createSupabaseBrowserClient();
      // Realtime checks row access as whoever it is told you are, so hand it your session first.
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) supabase.realtime.setAuth(data.session.access_token);

      // No column filter: Realtime already limits rows to the recipient's own.
      channel = supabase
        .channel("inbox")
        .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, refresh)
        .subscribe();
    })();

    document.addEventListener("visibilitychange", refreshIfVisible);
    const interval = setInterval(refreshIfVisible, BACKSTOP_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshIfVisible);
      if (supabase && channel) void supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
