import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/lib/db/types";

import { getSupabaseConfig } from "./config";

/** Supabase client for Client Components. Uses only the publishable key; RLS protects the data. */
export function createSupabaseBrowserClient() {
  const { url, publishableKey } = getSupabaseConfig();
  return createBrowserClient<Database>(url, publishableKey);
}
