// Pure request handling for the deliver-push function: claim due outbox rows, send each push,
// report what happened. No Deno or Supabase imports here, so it runs under Vitest as well as in
// the Edge runtime. index.ts wires in the real database and the push library.

/** One due push, as handed out by public.claim_push_outbox. */
export interface ClaimedPush {
  outboxId: string;
  /** How many times this row has been claimed, counting this one. */
  attempts: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  title: string;
  body: string;
  href: string;
}

export type Outcome =
  | { result: "sent" }
  | { result: "gone" }
  | { result: "retry"; retryInSeconds: number; error: string }
  | { result: "give_up"; error: string };

export interface DeliverDeps {
  /** False when the VAPID keys are missing: nothing is claimed, so nothing is lost. */
  configured: boolean;
  /** True when the secret matches the scheduler secret stored in Vault. */
  verifySecret(candidate: string): Promise<boolean>;
  /** Inserts a job_runs row; created: false when this (job, key) already ran. */
  recordRun(jobName: string, idempotencyKey: string): Promise<{ created: boolean }>;
  claim(limit: number): Promise<ClaimedPush[]>;
  /** Sends one encrypted push. Throws when the push service refuses, with `statusCode` if it gave one. */
  send(push: ClaimedPush, payload: string): Promise<void>;
  complete(outboxId: string, outcome: Outcome): Promise<void>;
  now(): Date;
}

const JOB_NAME = "deliver-push";
const BATCH_SIZE = 25;
/** At most this many batches per run, so one run can never go on indefinitely. */
const MAX_BATCHES = 4;

/** Wait before retry 1, 2 and 3 (SPEC-notifications N5): 1, 5 and 30 minutes. */
export const RETRY_DELAYS_SECONDS = [60, 300, 1800];
/** The first send plus one per retry delay. After this many, a push is given up. */
export const MAX_ATTEMPTS = RETRY_DELAYS_SECONDS.length + 1;

/** "2026-10-30T09:05": one key per UTC minute, so a double trigger does the work once. */
export function minuteBucket(date: Date): string {
  return date.toISOString().slice(0, 16);
}

/** An internal path only; anything else goes to the inbox (the service worker checks again). */
function safePath(value: string): string {
  return /^\/([^/\\]|$)/.test(value) ? value : "/notifications";
}

/**
 * What the phone receives: a title, one short line and a path. Never amounts or other detail, and
 * never anything about the device (SPEC-notifications N9).
 */
export function buildPayload(push: ClaimedPush): string {
  return JSON.stringify({
    title: push.title.slice(0, 80),
    body: push.body.slice(0, 200),
    path: safePath(push.href),
  });
}

function statusOf(error: unknown): number | undefined {
  const status = (error as { statusCode?: unknown } | null)?.statusCode;
  return typeof status === "number" ? status : undefined;
}

/**
 * Decides what a failed send means. 404 and 410 mean the device is gone for good. Everything else
 * (server errors, rate limits, network trouble) is retried with a growing delay, then given up.
 * The recorded reason is a status code or a fixed phrase, never the endpoint or the error text.
 */
export function classifyFailure(attempts: number, error: unknown): Outcome {
  const status = statusOf(error);
  if (status === 404 || status === 410) return { result: "gone" };

  const reason = status === undefined ? "network error" : `HTTP ${status}`;
  if (attempts >= MAX_ATTEMPTS) return { result: "give_up", error: reason };
  return {
    result: "retry",
    retryInSeconds: RETRY_DELAYS_SECONDS[Math.max(attempts, 1) - 1],
    error: reason,
  };
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

interface Summary {
  claimed: number;
  sent: number;
  gone: number;
  retried: number;
  gaveUp: number;
}

async function deliverOne(push: ClaimedPush, deps: DeliverDeps, summary: Summary) {
  let outcome: Outcome;
  try {
    await deps.send(push, buildPayload(push));
    outcome = { result: "sent" };
  } catch (error) {
    outcome = classifyFailure(push.attempts, error);
  }

  try {
    await deps.complete(push.outboxId, outcome);
  } catch {
    // The row stays leased and comes round again after the lease. Log the id only, never keys.
    console.error("deliver-push: could not record a result", push.outboxId);
    return;
  }

  if (outcome.result === "sent") summary.sent += 1;
  else if (outcome.result === "gone") summary.gone += 1;
  else if (outcome.result === "retry") summary.retried += 1;
  else summary.gaveUp += 1;
}

export async function handleDeliverPush(request: Request, deps: DeliverDeps): Promise<Response> {
  if (request.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);

  const secret = request.headers.get("x-scheduler-secret");
  if (!secret || !(await deps.verifySecret(secret))) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  if (!deps.configured) return json({ ok: false, error: "push is not configured" }, 503);

  try {
    const key = minuteBucket(await scheduledAt(request, deps.now()));
    const { created } = await deps.recordRun(JOB_NAME, key);
    if (!created) return json({ ok: true, skipped: true, idempotencyKey: key }, 200);

    const summary: Summary = { claimed: 0, sent: 0, gone: 0, retried: 0, gaveUp: 0 };
    for (let batch = 0; batch < MAX_BATCHES; batch++) {
      const due = await deps.claim(BATCH_SIZE);
      if (due.length === 0) break;
      summary.claimed += due.length;
      await Promise.all(due.map((push) => deliverOne(push, deps, summary)));
    }
    return json({ ok: true, idempotencyKey: key, ...summary }, 200);
  } catch (error) {
    console.error("deliver-push failed", error instanceof Error ? error.name : "error");
    return json({ ok: false, error: "internal error" }, 500);
  }
}
