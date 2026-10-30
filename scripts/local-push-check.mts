// Local-only smoke check that deliver-push runs in the real Supabase Edge runtime: it rejects a
// call without the scheduler secret, claims queued pushes from the database, builds and signs a
// Web Push request with npm:web-push, and records the outcome and a retry.
//
// What it cannot show is a push being ACCEPTED: the Edge runtime only trusts public certificates,
// and the database only stores https:// endpoints, so there is no local fake push service it will
// talk to. The three devices here point at a closed local port, so every send fails and is retried.
// Status handling against a fake HTTPS push service is covered by handler.test.ts, and the
// library's own behaviour (404/410/429/503 as WebPushError.statusCode, VAPID, aes128gcm) was
// checked against web-push@3.6.7 directly.
//
// Needs the local stack running (`pnpm db:start`) and Docker. It talks only to localhost and the
// local database container. It makes a throwaway VAPID pair and device keys, writes the function's
// env file to the OS temp folder (never the repo), and cleans up after itself.
//
//   node scripts/local-push-check.mts

import { type ChildProcess, execFileSync, spawn, spawnSync } from "node:child_process";
import { createECDH, randomBytes } from "node:crypto";
import { mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { generateVapidKeys } from "./vapid-keys.mts";

const CONTAINER = "supabase_db_flatmate";
const FUNCTION_URL = "http://127.0.0.1:54321/functions/v1/deliver-push";
const SECRET = `local-check-${randomBytes(8).toString("hex")}`;
const EMAIL = `push-check-${randomBytes(4).toString("hex")}@example.com`;
const USER = `(select id from auth.users where email = '${EMAIL}')`;

function sql(statement: string): string {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-tA", "-c", statement],
    { encoding: "utf8" },
  ).trim();
}

function check(condition: boolean, message: string) {
  console.log(`${condition ? "ok  " : "FAIL"} ${message}`);
  if (!condition) process.exitCode = 1;
}

// A device key the way a browser makes one: a P-256 point and a 16-byte auth secret.
function deviceKeys() {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return {
    p256dh: ecdh.getPublicKey().toString("base64url"),
    auth: randomBytes(16).toString("base64url"),
  };
}

let served: ChildProcess | undefined;
const workDir = mkdtempSync(join(tmpdir(), "flatmate-push-check-"));
const serveLog = join(workDir, "serve.log");

const startedAt = new Date().toISOString();

/** What the Edge runtime container logged since this script started (it keeps running between runs). */
function runtimeLog(): string {
  const result = spawnSync(
    "docker",
    ["logs", "--since", startedAt, "supabase_edge_runtime_flatmate"],
    {
      encoding: "utf8",
    },
  );
  return `${result.stdout}${result.stderr}`;
}

async function call(headers: Record<string, string>) {
  const response = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ scheduled_at: new Date().toISOString() }),
  });
  return {
    status: response.status,
    body: (await response.json().catch(() => ({}))) as Record<string, unknown>,
  };
}

async function waitForFunction() {
  for (let i = 0; i < 90; i++) {
    try {
      // Our own handler answers { error: "unauthorized" } to a call with no secret. The platform's
      // gateway also says 401 while a stale or half-started runtime is still up.
      const { status, body } = await call({});
      if (status === 401 && body.error === "unauthorized") return;
    } catch {
      // Not up yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("deliver-push did not start within 90 seconds");
}

async function main() {
  const vapid = generateVapidKeys();
  const envFile = join(workDir, "deliver-push.env");
  writeFileSync(
    envFile,
    `VAPID_PUBLIC_KEY=${vapid.publicKey}\nVAPID_PRIVATE_KEY=${vapid.privateKey}\nVAPID_SUBJECT=mailto:local-check@example.com\n`,
  );

  // A person in a flat with three devices, and one notification that pushes by default.
  sql(`insert into auth.users (id, email, raw_user_meta_data, aud, role)
       values (gen_random_uuid(), '${EMAIL}', '{"full_name": "Push Check"}', 'authenticated', 'authenticated')`);
  sql(`with p as (select id from public.profiles where user_id = ${USER}),
            h as (insert into public.households (name, created_by) select 'Push check flat', id from p returning id)
       insert into public.memberships (household_id, profile_id, role) select h.id, p.id, 'owner' from h, p`);
  for (const name of ["one", "two", "three"]) {
    const keys = deviceKeys();
    sql(`insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth)
         select id, 'https://localhost:9/${name}', '${keys.p256dh}', '${keys.auth}'
           from public.profiles where user_id = ${USER}`);
  }
  sql(`select private.notify(p.id, m.household_id, 'role_changed', 'You are now an admin',
                             'Local check.', '/more/flat', 'local-check:1')
         from public.profiles p join public.memberships m on m.profile_id = p.id
        where p.user_id = ${USER}`);

  // The scheduler secret the function checks (local vault only).
  sql(`delete from vault.secrets where name = 'scheduler_secret'`);
  sql(`select vault.create_secret('${SECRET}', 'scheduler_secret')`);

  console.log("starting supabase functions serve (the first run can take a minute)...");
  served = spawn(
    "pnpm",
    [
      "exec",
      "supabase",
      "functions",
      "serve",
      "deliver-push",
      "--no-verify-jwt",
      "--env-file",
      envFile,
    ],
    { stdio: ["ignore", openSync(serveLog, "a"), openSync(serveLog, "a")], shell: true },
  );
  await waitForFunction();

  check(
    (await call({ "x-scheduler-secret": "wrong" })).status === 401,
    "a wrong secret is rejected",
  );

  const first = await call({ "x-scheduler-secret": SECRET });
  console.log("function answered", first.status, JSON.stringify(first.body));
  check(first.status === 200 && first.body.claimed === 3, "claimed all three queued pushes");
  check(
    first.body.retried === 3 && first.body.sent === 0,
    "each failed send was recorded as a retry",
  );

  const rows = sql(`select count(*) filter (where o.attempts = 1 and o.sent_at is null
                                               and o.next_attempt_at > now() and o.last_error = 'network error')
                      from public.push_outbox o join public.push_subscriptions s on s.id = o.subscription_id
                     where s.profile_id = (select id from public.profiles where user_id = ${USER})`);
  check(rows === "3", "each row: one attempt, a later retry time, a short reason, nothing sent");

  const log = runtimeLog();
  check(
    (log.match(/deliver-push: send failed/g) ?? []).length === 3,
    "web-push ran in the Edge runtime for each device and tried to deliver",
  );
  check(!log.includes("localhost:9"), "the function log never contains a device endpoint");

  const again = await call({ "x-scheduler-secret": SECRET });
  check(again.body.skipped === true, "a second trigger in the same minute is skipped");
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  if (process.exitCode) {
    try {
      console.log("--- function log (tail) ---");
      console.log(runtimeLog().split("\n").slice(-25).join("\n"));
    } catch {
      // No log was written.
    }
  }
  served?.kill();
  rmSync(workDir, { recursive: true, force: true });
  try {
    const profile = `(select id from public.profiles where user_id = ${USER})`;
    sql(`delete from vault.secrets where name = 'scheduler_secret'`);
    sql(`delete from public.push_subscriptions where profile_id = ${profile}`);
    sql(`delete from public.notifications where recipient_id = ${profile}`);
    sql(`delete from public.memberships where profile_id = ${profile}`);
    sql(`delete from public.households where name = 'Push check flat'`);
    sql(`delete from public.profiles where user_id = ${USER}`);
    sql(`delete from auth.users where email = '${EMAIL}'`);
    sql(`delete from public.job_runs where job_name = 'deliver-push'`);
  } catch {
    console.error("cleanup incomplete; `pnpm db:reset` clears everything");
  }
}
