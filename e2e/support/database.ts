import { execFileSync } from "node:child_process";

/**
 * Runs SQL as the database owner in the LOCAL Supabase container, for setting up situations the
 * app itself does not create yet (such as a notification). Local only: it talks to the Docker
 * container Supabase starts for this project, never to a hosted database.
 */
const CONTAINER = "supabase_db_flatmate";

export function runLocalSql(sql: string): string {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-tA", "-c", sql],
    { encoding: "utf8" },
  ).trim();
}

function literal(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** Creates a notification for the person with this email, in the flat they are in. */
export function seedNotification(
  email: string,
  options: { title: string; type?: string; href?: string; dedupeKey: string; body?: string },
): void {
  runLocalSql(`
    select private.notify(
      p.id, m.household_id, ${literal(options.type ?? "role_changed")},
      ${literal(options.title)}, ${literal(options.body ?? "")},
      ${literal(options.href ?? "/more/flat")}, ${literal(options.dedupeKey)}
    )
    from auth.users u
    join public.profiles p on p.user_id = u.id
    join public.memberships m on m.profile_id = p.id and m.left_at is null
    where u.email = ${literal(email)}
  `);
}
