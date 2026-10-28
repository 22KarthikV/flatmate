import { connection } from "next/server";

import { createDatabaseCheck } from "@/features/health/database-check";
import { runHealthChecks } from "@/features/health/health";
import { getSupabaseConfig } from "@/lib/supabase/config";

/** Liveness and dependency check: the app itself and the database. */
export async function GET() {
  await connection(); // evaluate per request, never prerender

  const { httpStatus, ...body } = await runHealthChecks({
    app: async () => {},
    // Config is read inside the check so a missing variable reports "down" instead of a 500.
    database: () => createDatabaseCheck(getSupabaseConfig())(),
  });

  return Response.json(
    { ...body, time: new Date().toISOString() },
    { status: httpStatus, headers: { "Cache-Control": "no-store" } },
  );
}
