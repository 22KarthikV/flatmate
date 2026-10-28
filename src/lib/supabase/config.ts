export interface SupabaseConfig {
  url: string;
  publishableKey: string;
}

/**
 * Pure and dependency-free on purpose: the browser client imports this, so it must not pull in
 * zod. Validates presence only. The server-side `env.ts` also checks the URL format.
 */
export function readSupabaseConfig(source: {
  url?: string;
  publishableKey?: string;
}): SupabaseConfig {
  const missing: string[] = [];
  if (!source.url) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!source.publishableKey) missing.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");

  if (missing.length > 0) {
    throw new Error(
      `Missing environment variable${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. ` +
        "See .env.example.",
    );
  }
  return { url: source.url!, publishableKey: source.publishableKey! };
}

/**
 * Reads the public Supabase settings. Each variable is referenced literally so Next.js can
 * inline it into the browser bundle.
 */
export function getSupabaseConfig(): SupabaseConfig {
  return readSupabaseConfig({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}
