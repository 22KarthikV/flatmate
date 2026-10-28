import { connection } from "next/server";

import { runHealthChecks } from "@/features/health/health";

/** Liveness and dependency check. Later tasks add the database check here. */
export async function GET() {
  await connection(); // evaluate per request, never prerender

  const { httpStatus, ...body } = await runHealthChecks({
    app: async () => {},
  });

  return Response.json(
    { ...body, time: new Date().toISOString() },
    { status: httpStatus, headers: { "Cache-Control": "no-store" } },
  );
}
