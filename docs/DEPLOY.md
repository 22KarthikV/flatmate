# Deployment

| Piece    | Where                                   | Trigger                                         |
| -------- | --------------------------------------- | ----------------------------------------------- |
| App      | Vercel project `flatmate` (Hobby)       | Push to `main` = production; every PR = preview |
| Database | Supabase project `flatmate` (eu-west-2) | Migrations applied by hand (below)              |
| Jobs     | `pg_cron` on the same Supabase project  | Registered by migrations (ADR-002)              |

## Environment variables (Vercel, Production and Preview)

| Name                                   | Value                               |
| -------------------------------------- | ----------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | `https://<project-ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the `sb_publishable_...` key        |
| `LOG_LEVEL`                            | `info`                              |

Only the publishable key ever goes into Vercel. Service-role or secret keys never do (a test enforces this for `src/`).

## Applying migrations to the hosted project

```bash
pnpm exec supabase login
pnpm exec supabase link --project-ref <project-ref>
pnpm exec supabase db push
```

If migrations were applied through the dashboard or an MCP tool, their versions differ from the files; run `supabase migration repair` before `db push`.

## Per-environment scheduler secrets

Once per environment, in the SQL editor (never in a migration):

```sql
select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
select vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'scheduler_secret');
```

Then deploy the function: `supabase functions deploy heartbeat --no-verify-jwt`.

## After a deploy

- `GET /api/health` returns 200 with `app` and `database` both `ok`.
- A `heartbeat` row appears in `job_runs` within the hour.
