import "server-only";

import { cache } from "react";
import { connection } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * The verified session for this request, with the Supabase client that goes with it. Cached for
 * the request, so the layout's session check and the page's own data share one client and one
 * claims check instead of repeating them.
 */
export const getRequestSession = cache(async () => {
  // Request time only: the Supabase client reads the clock on start-up, which Next forbids
  // while it prerenders or prefetches.
  await connection();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  return { supabase, claims: data?.claims ?? null };
});
