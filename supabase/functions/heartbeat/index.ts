import { createClient } from "npm:@supabase/supabase-js@2.118.0";

import { handleHeartbeat } from "./handler.ts";

// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected by the platform, locally and hosted.
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

Deno.serve((request) =>
  handleHeartbeat(request, {
    async verifySecret(candidate) {
      const { data, error } = await supabase.rpc("verify_scheduler_secret", { candidate });
      if (error) throw error;
      return data === true;
    },
    async recordRun(jobName, idempotencyKey) {
      // Insert-if-absent: the unique (job_name, idempotency_key) pair decides who wins a race.
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
    now: () => new Date(),
  }),
);
