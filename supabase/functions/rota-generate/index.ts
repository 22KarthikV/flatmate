import { createClient } from "npm:@supabase/supabase-js@2.118.0";

import { handleRotaGenerate } from "./handler.ts";

// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected by the platform, locally and hosted.
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

Deno.serve((request) =>
  handleRotaGenerate(request, {
    async verifySecret(candidate) {
      const { data, error } = await supabase.rpc("verify_scheduler_secret", { candidate });
      if (error) throw error;
      return data === true;
    },
    async dueGenerations(now) {
      const { data, error } = await supabase.rpc("rota_due_generations", {
        p_now: now.toISOString(),
      });
      if (error) throw error;
      return (data ?? []).map((row: { household_id: string; week_start: string }) => ({
        householdId: row.household_id,
        weekStart: row.week_start,
      }));
    },
    async loadInput(householdId, weekStart) {
      const { data, error } = await supabase.rpc("rota_generation_input_for", {
        p_household: householdId,
        p_week_start: weekStart,
      });
      if (error) throw error;
      return data;
    },
    async store(householdId, weekStart, assignments, owed) {
      const { data, error } = await supabase.rpc("store_rota_week_for", {
        p_household: householdId,
        p_week_start: weekStart,
        p_assignments: assignments,
        p_owed: owed,
      });
      if (error) throw error;
      return data as string;
    },
    async pendingRebuilds() {
      const { data, error } = await supabase.rpc("rota_pending_rebuilds");
      if (error) throw error;
      return (data ?? []).map((row: { rebuild_id: string }) => row.rebuild_id);
    },
    async loadRebuildInput(rebuildId) {
      const { data, error } = await supabase.rpc("rota_rebuild_input", { p_rebuild: rebuildId });
      if (error) throw error;
      return data;
    },
    async applyRebuild(rebuildId, moves) {
      const { data, error } = await supabase.rpc("rota_apply_rebuild", {
        p_rebuild: rebuildId,
        p_moves: moves,
      });
      if (error) throw error;
      return data as string;
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
    now: () => new Date(),
  }),
);
