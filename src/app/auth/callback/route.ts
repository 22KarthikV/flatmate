import { connection } from "next/server";

import { handleAuthCallback } from "@/features/identity/callback";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Where Google sends people back to (via Supabase) with a one-time code. */
export async function GET(request: Request) {
  await connection(); // per request, never prerendered

  const supabase = await createSupabaseServerClient();
  return handleAuthCallback(request, {
    exchangeCodeForSession: (code) => supabase.auth.exchangeCodeForSession(code),
  });
}
