import "server-only";

import { redirect } from "next/navigation";
import { connection } from "next/server";
import type { ReactNode } from "react";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Second line of defence behind proxy.ts: nothing inside the app renders unless the verified
 * session says someone is signed in. Checks the claims only, never the profile row, so a person
 * whose profile is missing cannot be bounced between here and /sign-in.
 */
export async function RequireSession({ children }: { children: ReactNode }) {
  await connection();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/sign-in");
  return <>{children}</>;
}
