# ADR-003: Multi-tenancy and row-level security

Status: accepted
Date: 2026-10-28

## Context

Many independent households will share one database. A user in one household must never read or change another household's data, and a mistake in application code must not be able to break that. Households are tiny (about five people, a few thousand rows a year), so the unit of isolation is the household.

## Decision

1. **Tenant key everywhere.** Every household-owned table has `household_id uuid not null`. There are no cross-household joins in application code.
2. **RLS is the boundary.** Row-level security is enabled in the same migration that creates the table, and it is never disabled. The app uses the publishable key plus the signed-in user's session, so policies always apply.
3. **One membership helper.** Policies call a single `security definer` function (for example `private.is_household_member(household_id)`) that checks `memberships` for the current user. It sets an empty `search_path` and is wrapped as `(select auth.uid())` inside policies so Postgres evaluates it once per query, not per row. Roles (member, admin) are checked by a second helper, so "admin only" rules live in one place.
4. **Policies per operation** (select, insert, update, delete), written for the narrowest role that needs them. No policy means no access, which is the default for tables only the server touches (such as `job_runs`).
5. **Indexes match the checks.** `memberships (user_id, household_id)` and `(household_id, user_id)`, and every child table indexed on `(household_id, <main access column>)`.
6. **Service role stays server-side.** It bypasses RLS, so it is used only in Edge Functions and the database (scheduler, outbox delivery). A test fails the build if a service-role or secret key appears in `src/`. Functions that run with it authenticate their caller ([ADR-002](002-scheduling.md)).
7. **Append-only money.** Expenses, shares and settlements are never updated or deleted; corrections are voids or adjustments. Money is integer pence, with a constraint that shares sum to the amount.
8. **Idempotent generation.** Generated rows carry a unique key (`(template_id, period)`, `(household_id, week_start)`, `dedupe_key`) so retries are safe.

## How it is tested

Every module's pgTAP tests include:

- A member can read and write their own household's rows.
- A user in another household gets zero rows and rejected writes (the **cross-tenant denial test**).
- `anon` gets nothing.
- Role rules (admin versus member) hold.

The foundation already proves the pattern on `job_runs`: RLS on, no policies, `anon` and `authenticated` both rejected (`supabase/tests/database/job_runs.test.sql`).

## Alternatives considered

- **Schema or database per household:** heavy migrations and connection overhead for thousands of tiny tenants.
- **Application-level filtering only:** one forgotten `where` leaks data; RLS makes the safe path the default.
- **Custom JWT claim with `household_id`:** fast checks but breaks when a user belongs to several households or membership changes mid-session. A membership lookup with the right index is fast enough at this scale.

## Consequences

- Each new table needs policies and tests before it can merge; this is part of the definition of done.
- Policy helpers are on the hot path, so their indexes are reviewed with each module.
- A household can later be moved to its own shard because nothing joins across households.
