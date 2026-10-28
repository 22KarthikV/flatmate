// Pure request handling for the heartbeat function. No Deno or Supabase imports here, so it runs
// under Vitest as well as in the Edge runtime. index.ts wires in the real dependencies.

export interface HeartbeatDeps {
  /** True when the secret matches the scheduler secret stored in Vault. */
  verifySecret(candidate: string): Promise<boolean>;
  /**
   * Inserts a job_runs row. Returns created: false when the (jobName, key) pair already exists,
   * which is what makes retries and double triggers harmless.
   */
  recordRun(jobName: string, idempotencyKey: string): Promise<{ created: boolean }>;
  now(): Date;
}

const JOB_NAME = "heartbeat";

/** "2026-10-28T12": one key per UTC hour, so the job runs at most once an hour. */
export function hourBucket(date: Date): string {
  return date.toISOString().slice(0, 13);
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

export async function handleHeartbeat(request: Request, deps: HeartbeatDeps): Promise<Response> {
  if (request.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);

  const secret = request.headers.get("x-scheduler-secret");
  if (!secret || !(await deps.verifySecret(secret))) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  try {
    const idempotencyKey = hourBucket(await scheduledAt(request, deps.now()));
    const { created } = await deps.recordRun(JOB_NAME, idempotencyKey);
    return json({ ok: true, created, idempotencyKey }, 200);
  } catch (error) {
    console.error("heartbeat failed", error);
    return json({ ok: false, error: "internal error" }, 500);
  }
}
