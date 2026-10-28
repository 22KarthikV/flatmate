# Contributing

FlatMate is built one module at a time. Each module goes through the same lifecycle, and nothing merges unless the checks pass.

## Module lifecycle

1. **Spec**: write `docs/SPEC-<module>.md` (objective, user stories, data model, commands, boundaries, success criteria). Get it approved before coding.
2. **Plan**: break the work into small, verifiable tasks in `tasks/plan.md` and `tasks/todo.md`, each with acceptance criteria and a verify command.
3. **Build, test first**: for domain logic (splits, simplification, rotation, scheduling), write the failing test, then the code. One task per pull request where practical.
4. **Review**: correctness, readability, architecture, security, performance.
5. **Ship**: merge to `main` (Vercel deploys production), apply migrations to the hosted project ([docs/DEPLOY.md](docs/DEPLOY.md)), smoke-test on an Android and an iPhone browser, update the task list.

## Definition of done (per module)

- Spec and plan approved.
- Migrations reviewed. RLS tested, including a cross-household denial test ([ADR-003](docs/adr/003-multi-tenancy-rls.md)).
- Domain logic written test-first. Unit, database and end-to-end tests pass.
- `pnpm check` passes. CI is green on the pull request.
- Reviewed across the five axes above.
- Deployed and smoke-tested on real devices.

## Workflow

- Branch from `main`: `feat/<task>`, `fix/<what>`, `docs/<what>`. Never commit to `main` directly; branch protection requires the four CI checks (lint/types/unit/build/bundle, end-to-end, Lighthouse, database).
- Commits follow `type(scope): summary` (`feat`, `fix`, `docs`, `test`, `ci`, `chore`). A pre-commit hook formats and lints staged files.
- Open a pull request, wait for green checks, squash-merge, delete the branch.

## Rules that are never broken

- **Schema changes are migrations only.** Never edit the schema in the Supabase dashboard. Add a file under `supabase/migrations/`, run `pnpm db:reset`, `pnpm db:test`, then `pnpm db:types` and commit the regenerated types (CI fails if they are stale).
- **RLS is enabled in the same migration that creates the table**, and has pgTAP tests.
- **Money is integer pence.** No floating point.
- **No secrets in git.** Only the publishable key is ever used in app code; the service-role key stays in Edge Functions and the database. A test scans `src/` for this.
- **Validate all input with Zod** on every write.
- **Do not skip or delete a failing test** to get green; fix the cause or raise it.
- **Motion has a budget**: lazy-loaded, respects reduced motion, enforced in CI by `pnpm check:bundle`.
- **Ask before adding a dependency.** Note its licence in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Adding a scheduled job

See [ADR-002](docs/adr/002-scheduling.md): register it in the module's migration with `private.register_edge_job(...)`, add `supabase/functions/<name>/` with a pure, tested `handler.ts`, and choose an idempotency key that matches the job's cadence.

## Writing style

Plain English, short sentences, UK spelling in user-facing text. No filler.
