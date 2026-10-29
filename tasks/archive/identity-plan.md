# Implementation Plan: identity

Spec: [docs/SPEC-identity.md](../../docs/SPEC-identity.md) (approved 2026-10-28). Task list: [tasks/identity-todo.md](identity-todo.md). The foundation plan is archived alongside this one.

## Overview

Google sign-in, profiles, route protection, account page (rename, sign out, delete), privacy and terms pages.

## Architecture decisions

- **Database first, then flow, then screens.** The profile table and its RLS tests come first (everything else depends on them), then the redirect and guard logic (pure, test-first), then the sign-in round trip, then the account UI.
- **Google setup is its own early task** because it is the riskiest external dependency (consent screen, redirect URIs, iOS standalone behaviour). The iPhone check happens as soon as the callback exists, not at the end.
- **Secrets stay out of my reach.** I create the Google OAuth client; the owner pastes the client secret into the Supabase dashboard (and into the gitignored `.env.local` for local sign-in).
- **Local tests use email sign-in, production does not.** E2E signs a test user in through the local stack and injects the session cookies.

```
1 Google + Supabase provider setup ─┐
2 profiles migration + pgTAP ───────┤
3 safe-redirect + route guard ──────┼─ 4 callback + sign-in + error pages ─ 5 account page
                                    │                                     └ 6 delete-account function
7 privacy + terms pages (independent)
                  all ─ 8 E2E, hosted + device checks
```

## Task list

- [x] Task 1: Google Cloud client and Supabase Google provider
- [x] Task 2: `profiles` table, trigger, RLS, pgTAP
- [x] Task 3: Safe redirect and route guard (pure logic, tests first)
- [ ] Task 4: Callback, sign-in and error pages (+ early iPhone check)
- [x] Task 5: Account page: rename, sign out, sign out everywhere
- [x] Task 6: `delete-account` Edge Function and flow
- [x] Task 7: Privacy and terms pages
- [ ] Task 8: E2E suite, hosted verification, device checks

### Checkpoint: Identity complete

- [ ] Every success criterion in the spec is met

## Risks

| Risk                                          | Mitigation                                                        |
| --------------------------------------------- | ----------------------------------------------------------------- |
| iOS standalone breaks the OAuth round trip    | Check on a real iPhone right after Task 4; fallback in the spec   |
| Consent screen left in Testing blocks others  | Task 1 publishes it and verifies with a second Google account     |
| Preview deployments cannot sign in            | Wildcard redirect URL for this Vercel project (Task 1)            |
| Local Google sign-in needs the secret locally | Optional: only for manual local checks; tests use the email login |
