/**
 * Lighthouse for pages that need a signed-in person. Signs a throwaway user in against the LOCAL
 * Supabase stack, then runs lhci with that person's session cookies on every request.
 *   node scripts/lighthouse-app.mts        (after `pnpm build`, with local Supabase running)
 */
import { spawnSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";

import { createFlat, newTestUser, signUpAndIn } from "../e2e/support/session.ts";

const { jar, supabase } = await signUpAndIn(newTestUser("lighthouse"));
// A flat, so the signed-in pages are audited as people will really see them.
await createFlat(supabase, "Lighthouse flat");
const cookie = [...jar].map(([name, { value }]) => `${name}=${value}`).join("; ");

const config = JSON.parse(readFileSync("lighthouserc.app.json", "utf8"));
config.ci.collect.settings = { extraHeaders: JSON.stringify({ Cookie: cookie }) };

// The cookie is a live (local-only) session, so keep the file out of the repo and delete it after.
const file = ".lighthouserc.app.generated.json";
writeFileSync(file, JSON.stringify(config));
try {
  const result = spawnSync("pnpm", ["exec", "lhci", "autorun", `--config=${file}`], {
    stdio: "inherit",
    shell: process.platform === "win32", // pnpm is a .cmd file on Windows
  });
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(file, { force: true });
}
