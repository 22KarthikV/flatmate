# Task list: identity

Plan: [plan.md](plan.md). Spec: [../docs/SPEC-identity.md](../docs/SPEC-identity.md). Tests come first for any logic (TDD).

- [x] **Task 1: Google Cloud client and Supabase Google provider** (Small, human gate). Consent screen stays in Testing mode (Google cannot publish without a verifiable domain); your Gmail is a test user. Add flatmates as test users until a custom domain exists.
  - Description: Create the Google Cloud project and Web OAuth client, configure the consent screen (production, scopes `openid email profile`), add redirect URIs (Supabase callback for hosted and local), set the Supabase redirect allow-list (production, previews, localhost), enable the Google provider in `supabase/config.toml` for local, and in the hosted dashboard (owner pastes the secret).
  - Acceptance:
    - [x] Hosted Supabase Google provider enabled with the client ID; secret entered by the owner
    - [x] Redirect allow-list covers production, Vercel previews and localhost
    - [x] `supabase/config.toml` has the Google provider reading `env(...)` values; `.env.example` documents them
    - [x] Email sign-in enabled locally only, disabled on hosted
  - Verify: Supabase authorize URL redirects to Google's consent screen
  - Dependencies: none

- [x] **Task 2: `profiles` table, trigger, RLS, pgTAP** (Medium). 22 pgTAP assertions. Hosted migration to be applied after merge.
  - Description: Migration per the spec (own uuid, `user_id` set null on delete, name 1 to 50, https avatar, `deleted_at`), signup trigger from OAuth metadata, RLS (self select and update of `display_name` only), anonymise function. Tests first.
  - Acceptance:
    - [x] pgTAP: trigger maps name and avatar, falls back to email local part, truncates, rejects non-https avatar
    - [x] pgTAP: user A cannot read, update or delete user B; `anon` has nothing; protected columns cannot be changed
    - [x] pgTAP: deleting the auth user keeps the profile with `user_id` null; anonymise sets "Deleted user"
    - [x] Types regenerated, `pnpm db:test` green
  - Verify: `pnpm db:reset && pnpm db:test && pnpm db:types`
  - Dependencies: none

- [x] **Task 3: Safe redirect and route guard** (Small). Wired into proxy.ts behind AUTH_GUARD=on (off by default) because E2E and Lighthouse open signed-in pages anonymously today; Task 8 turns it on and adds the layout-level second check.
  - Description: `safe-redirect.ts` and the guard decision used by `proxy.ts` / the `(app)` layout. Signed-out visitors to `(app)` routes go to `/sign-in?next=...`; signed-in visitors to `/sign-in` go on.
  - Acceptance:
    - [x] Unit tests: rejects `//evil.com`, `https://evil.com`, `/\evil`, `javascript:` and encoded variants; accepts `/dashboard?x=1`
    - [x] Guard uses `getClaims()`; Supabase being down does not leak page content
  - Verify: `pnpm test`
  - Dependencies: none

- [ ] **Task 4: Callback, sign-in and error pages** (Medium)
  - Description: `/sign-in` (Continue with Google, privacy and terms links), `/auth/callback` (PKCE exchange, safe `next`), `/auth/error`. Editorial design per ADR-004.
  - Acceptance:
    - [ ] Real Google sign-in works locally and on a preview
    - [ ] Failures show one neutral message and no details
    - [ ] Android Chrome, iPhone Safari and the installed iPhone app checked (result recorded)
  - Verify: manual on devices, `pnpm test`, Lighthouse on `/sign-in`
  - Dependencies: Tasks 1, 2, 3

- [x] **Task 5: Account page** (Small). Sign out everywhere is tested at the session level: the other device's refresh fails. Its current access token stays valid until it expires (up to an hour), as the page tells people.
  - Description: `/more/account`: profile, rename (zod, 1 to 50), sign out, sign out everywhere.
  - Acceptance:
    - [x] Rename persists and validates; errors are inline
    - [x] Sign out everywhere invalidates a second session (tested)
  - Verify: `pnpm test`, E2E in Task 8
  - Dependencies: Task 4

- [x] **Task 6: `delete-account` function and flow** (Medium). The "member left" signal is the profile's deleted_at stamp (plus an account.deleted log line): the rota, recurring and ledger modules rebalance when they see a member whose profile is deleted, so no speculative event table was added. Function must be deployed to hosted after merge.
  - Description: Edge Function (verified user JWT) that anonymises the profile and deletes the auth user; typed confirmation in the UI; emits the "member left" signal for later modules.
  - Acceptance:
    - [x] Handler tests: needs a valid user, anonymises before deleting, no detail leaks
    - [x] After deletion the session is gone and the profile reads "Deleted user"
  - Verify: `pnpm test`, local run
  - Dependencies: Tasks 2, 5

- [x] **Task 7: Privacy and terms pages** (Small). Draft in plain English, not legal advice: the owner should read both pages. Contact shows the GitHub issue tracker until NEXT_PUBLIC_CONTACT_EMAIL is set in Vercel.
  - Description: `/privacy` (exactly what is stored, why, how to delete or request data) and `/terms` (plain-English terms), linked from sign-in and the footer.
  - Acceptance:
    - [x] Both public, accessible, offline-safe, in the editorial style
    - [x] Privacy page matches what the code actually stores
  - Verify: review by owner, Lighthouse
  - Dependencies: none

- [ ] **Task 8: E2E, hosted verification, device checks** (Medium). Code done: the guard is on unless AUTH_GUARD=off (so no Vercel setting is needed), `(app)` layout re-checks the session, E2E and a signed-in Lighthouse run use a local test user. Open: production sign-in, persistence and deletion on a real Google account, and the phone checks (owner).
  - Description: Playwright flows from the spec using the local email test user (existing E2E specs and Lighthouse switch to a signed-in session); turn on AUTH_GUARD by default (CI and Vercel); add the layout-level second check in the (app) layout; hosted sign-in on production; real-device checks.
  - Acceptance:
    - [x] All E2E flows pass locally (CI to confirm on the PR)
    - [ ] Production sign-in, session persistence and deletion verified
  - Verify: CI, manual
  - Dependencies: Tasks 4 to 7

### Checkpoint: Identity complete

- [ ] All spec success criteria met
- [ ] Ready for review; next module is `household` (spec first)
