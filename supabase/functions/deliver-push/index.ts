import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import webpush from "npm:web-push@3.6.7";

import { handleDeliverPush, type ClaimedPush, type Outcome } from "./handler.ts";

// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected by the platform, locally and hosted.
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

// The VAPID pair comes from Supabase secrets (see docs/DEPLOY.md). Without all three the function
// answers 503 and claims nothing, so queued pushes simply wait. Values are never logged.
let configured = false;
try {
  const subject = Deno.env.get("VAPID_SUBJECT");
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  if (subject && publicKey && privateKey) {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    configured = true;
  }
} catch {
  console.error("deliver-push: the VAPID settings are not valid");
}

/** How long the push service may hold a message for a phone that is off: an hour, then it is stale. */
const TTL_SECONDS = 3600;

Deno.serve((request) =>
  handleDeliverPush(request, {
    configured,
    async verifySecret(candidate) {
      const { data, error } = await supabase.rpc("verify_scheduler_secret", { candidate });
      if (error) throw error;
      return data === true;
    },
    async recordRun(jobName, idempotencyKey) {
      const { data, error } = await supabase
        .from("job_runs")
        .upsert(
          { job_name: jobName, idempotency_key: idempotencyKey },
          { onConflict: "job_name,idempotency_key", ignoreDuplicates: true },
        )
        .select("id");
      if (error) throw error;
      const created = (data ?? []).length > 0;
      if (created) {
        const { error: finishError } = await supabase
          .from("job_runs")
          .update({ status: "succeeded", finished_at: new Date().toISOString() })
          .eq("id", data![0].id);
        if (finishError) throw finishError;
      }
      return { created };
    },
    async claim(limit) {
      const { data, error } = await supabase.rpc("claim_push_outbox", { p_limit: limit });
      if (error) throw error;
      return (data ?? []).map((row: Record<string, unknown>): ClaimedPush => ({
        outboxId: row.outbox_id as string,
        attempts: row.attempts as number,
        endpoint: row.endpoint as string,
        p256dh: row.p256dh as string,
        auth: row.auth as string,
        title: row.title as string,
        body: row.body as string,
        href: row.href as string,
      }));
    },
    async send(push, payload) {
      try {
        await webpush.sendNotification(
          { endpoint: push.endpoint, keys: { p256dh: push.p256dh, auth: push.auth } },
          payload,
          { TTL: TTL_SECONDS, urgency: "normal", timeout: 10_000 },
        );
      } catch (error) {
        // Name, status and code only: the message can contain the endpoint, which is a credential.
        const e = error as { name?: string; statusCode?: number; code?: string };
        console.error("deliver-push: send failed", e.name, e.statusCode ?? "", e.code ?? "");
        throw error;
      }
    },
    async complete(outboxId, outcome: Outcome) {
      const { error } = await supabase.rpc("complete_push", {
        p_outbox_id: outboxId,
        p_result: outcome.result,
        p_retry_in_seconds: outcome.result === "retry" ? outcome.retryInSeconds : null,
        p_error: "error" in outcome ? outcome.error : null,
      });
      if (error) throw error;
    },
    now: () => new Date(),
  }),
);
