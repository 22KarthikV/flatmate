import type { SupabaseConfig } from "@/lib/supabase/config";

/**
 * Health check that proves the database answers: calls `public.health_ping()` through the REST
 * API with the publishable key, the same path the app's own queries take.
 * `fetchImpl` is injectable so the check can be tested without a database.
 */
export function createDatabaseCheck(
  { url, publishableKey }: SupabaseConfig,
  fetchImpl: typeof fetch = fetch,
): () => Promise<void> {
  return async () => {
    const response = await fetchImpl(`${url}/rest/v1/rpc/health_ping`, {
      method: "POST",
      headers: { apikey: publishableKey, "Content-Type": "application/json" },
      body: "{}",
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`health_ping answered ${response.status}`);
    if ((await response.json()) !== true)
      throw new Error("health_ping returned an unexpected value");
  };
}
