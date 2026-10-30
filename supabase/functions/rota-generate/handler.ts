// Pure request handling for the rota-generate function. No Deno or Supabase imports here, so it
// runs under Vitest as well as in the Edge runtime. index.ts wires in the real dependencies.
//
// Once an hour the database says which flats are due a new week (those that use the rota, whose
// availability window has just closed and that have no current revision). For each, the function
// reads the inputs, runs the same pure scheduler the app runs, and stores the result. Storing is
// idempotent in the database, so a retry or a second trigger changes nothing.
//
// The same call also applies any pending rebuilds: when someone has left a flat, the database has
// recorded it, and here the pure rebalance decides who takes their chores. Every ten minutes is
// enough; with nothing pending it does no work.

import { parseGenerationInput, planWeek } from "../_shared/rota/generation.ts";
import { planRebuild, type PlannedMove } from "../_shared/rota/rebuild.ts";

export interface DueWeek {
  householdId: string;
  weekStart: string;
}

export interface RotaGenerateDeps {
  verifySecret(candidate: string): Promise<boolean>;
  dueGenerations(now: Date): Promise<DueWeek[]>;
  loadInput(householdId: string, weekStart: string): Promise<unknown>;
  store(
    householdId: string,
    weekStart: string,
    assignments: unknown,
    owed: unknown,
  ): Promise<string>;
  pendingRebuilds(): Promise<string[]>;
  loadRebuildInput(rebuildId: string): Promise<unknown>;
  applyRebuild(rebuildId: string, moves: PlannedMove[]): Promise<string>;
  recordRun(jobName: string, idempotencyKey: string): Promise<{ created: boolean }>;
  now(): Date;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function scheduledAt(request: Request, fallback: Date): Promise<Date> {
  try {
    const body = (await request.json()) as { scheduled_at?: unknown };
    if (typeof body.scheduled_at === "string") {
      const parsed = new Date(body.scheduled_at);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
  } catch {
    // Empty or non-JSON body: use the current time.
  }
  return fallback;
}

export async function handleRotaGenerate(
  request: Request,
  deps: RotaGenerateDeps,
): Promise<Response> {
  if (request.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);

  const secret = request.headers.get("x-scheduler-secret");
  if (!secret || !(await deps.verifySecret(secret))) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  try {
    const now = await scheduledAt(request, deps.now());
    const due = await deps.dueGenerations(now);
    let generated = 0;
    let failed = 0;

    for (const { householdId, weekStart } of due) {
      try {
        const input = parseGenerationInput(await deps.loadInput(householdId, weekStart));
        const plan = planWeek(weekStart, input);
        await deps.store(householdId, weekStart, plan.assignments, plan.owed);
        await deps.recordRun("rota-generate", `${householdId}:${weekStart}`);
        generated += 1;
      } catch (error) {
        // One flat's problem must not stop the others; the next hour tries again.
        failed += 1;
        console.error("rota-generate failed for a flat", error);
      }
    }

    let rebuilt = 0;
    for (const rebuildId of await deps.pendingRebuilds()) {
      try {
        const moves = planRebuild(await deps.loadRebuildInput(rebuildId));
        await deps.applyRebuild(rebuildId, moves);
        rebuilt += 1;
      } catch (error) {
        // Stale inputs or one bad flat: it stays pending and the next run reads fresh inputs.
        failed += 1;
        console.error("rota-generate could not rebuild after a leaving", error);
      }
    }
    return json(
      { ok: failed === 0, due: due.length, generated, rebuilt, failed },
      failed === 0 ? 200 : 207,
    );
  } catch (error) {
    console.error("rota-generate failed", error);
    return json({ ok: false, error: "internal error" }, 500);
  }
}
