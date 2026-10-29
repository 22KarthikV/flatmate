import { createClient } from "npm:@supabase/supabase-js@2.118.0";

import { handleDeleteAccount } from "./handler.ts";

// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected by the platform, locally and hosted.
const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

Deno.serve((request) =>
  handleDeleteAccount(request, {
    async getUserId(accessToken) {
      // Asks the auth server, so a revoked or forged token is refused, not just checked locally.
      const { data, error } = await admin.auth.getUser(accessToken);
      return error ? null : (data.user?.id ?? null);
    },
    async anonymiseProfile(userId) {
      const { error } = await admin.rpc("anonymise_profile", { p_user_id: userId });
      if (error) throw error;
    },
    async deleteAuthUser(userId) {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) throw error;
    },
    log: (event) => console.log(JSON.stringify({ event })),
  }),
);
