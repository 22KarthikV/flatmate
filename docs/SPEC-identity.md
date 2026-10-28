# Spec: identity

Status: draft, awaiting approval. Depends on: `foundation` (complete). Unlocks: `household`.

## Objective

People can sign in to FlatMate with Google, stay signed in on their phone, see and edit their basic profile, sign out (this device or everywhere) and delete their account. Nothing in the signed-in app is reachable without a valid session. No passwords are ever stored or handled by FlatMate.

Capabilities from the requirements: FR-ID-1 (Google sign-in, automatic profile), FR-ID-2 (session persists on mobile, sign-out works on all devices), FR-ID-3 (account deletion anonymises shared history). Acceptance from the requirements: unauthenticated requests can never read or write any household data.

### User stories

- As a flatmate, I tap "Continue with Google" and land in the app, with my name and photo already filled in.
- As a flatmate, I open the installed app days later and I am still signed in.
- As a flatmate, I can sign out of this phone, or of every device if I lose one.
- As a flatmate, I can change the name my flatmates see.
- As a flatmate, I can delete my account. My past expenses and chores stay for the others, shown as "Former flatmate".
- As a visitor, I can read what data FlatMate keeps before I sign in.
- As the developer, I can prove with database tests that one user can never read or change another user's profile.

## Decisions to confirm

| #   | Decision                                                                                                                                                                                                                                                                         |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I1  | **Google is the only sign-in method** in production (D2). Email and password is enabled in the **local** stack only, so automated tests can sign in without Google. It stays off on the hosted project.                                                                          |
| I2  | **PKCE code flow** with a server callback at `/auth/callback`. Tokens never appear in the URL fragment.                                                                                                                                                                          |
| I3  | **Server-side checks use `getClaims()`**, never `getSession()`, to decide who the user is (already the pattern in `src/lib/supabase/session.ts`).                                                                                                                                |
| I4  | **Profiles are separate from `auth.users`**: `profiles.id` is its own uuid, and `user_id` links to the auth user with `on delete set null`. Deleting the auth user therefore leaves the profile row behind to be anonymised, so later tables can keep pointing at `profiles.id`. |
| I5  | **Display name is editable; the photo comes from Google** and is refreshed on each sign-in unless the user has never changed it. No uploads in this module.                                                                                                                      |
| I6  | **Account deletion** runs in an Edge Function with the service role: it anonymises the profile (name "Former flatmate", no photo, `deleted_at` set), then deletes the auth user. Sessions end immediately.                                                                       |
| I7  | **Data export** (UK GDPR) is not in this module. It is added to `extras` once there is household data worth exporting. The privacy page says how to ask in the meantime.                                                                                                         |

## Assumptions (correct me)

1. You will create a Google Cloud OAuth client (Web application) and paste its ID and secret into the Supabase dashboard yourself. I never see the secret. Steps are in the plan.
2. The Google consent screen is set to **In production** with only the basic scopes (`openid`, `email`, `profile`). That needs no Google verification review. Left in "Testing" mode, only emails you list (max 100) could sign in.
3. The three redirect locations are allowed: production (`flatmate-ten.vercel.app`), Vercel preview URLs for this project, and `http://localhost:3000` for development.
4. Nobody is a household member yet; households arrive in the next module. Until then a signed-in user sees the existing placeholder pages plus an Account page.

## Tech and structure

No new runtime dependencies are expected: `@supabase/ssr` and `zod` are already installed.

```
src/features/identity/
  safe-redirect.ts        only allows same-site relative paths for ?next=
  profile.ts              zod schemas: display name rules, profile type
  actions.ts              server actions: signOut, signOutEverywhere, updateDisplayName, deleteAccount
  sign-in-button.tsx      "Continue with Google" (follows Google's branding rules)
  account-panel.tsx       profile form, sign-out buttons, delete flow
src/app/(public)/sign-in/page.tsx
src/app/(public)/privacy/page.tsx
src/app/auth/callback/route.ts      exchanges the code, then redirects to a safe path
src/app/auth/error/page.tsx         friendly failure page
src/app/(app)/more/account/page.tsx
src/lib/supabase/session.ts         extended: signed-out visitors to (app) routes go to /sign-in?next=...
supabase/migrations/*_profiles.sql
supabase/tests/database/profiles.test.sql
supabase/functions/delete-account/{index.ts,handler.ts,handler.test.ts}
```

### Data model

```sql
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete set null,
  display_name text not null check (char_length(display_name) between 1 and 50),
  avatar_url text check (avatar_url is null or avatar_url ~ '^https://'),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- RLS on. A user can select and update only the row where user_id = their own id.
-- Nobody can insert or delete through the API: a security-definer trigger on auth.users
-- creates the row on first sign-in; the delete-account function anonymises it.
```

- The trigger reads `raw_user_meta_data` (`full_name` or `name`, `avatar_url` or `picture`), trims and truncates the name to 50 characters, falls back to the email's local part, and accepts only `https` avatar URLs.
- Users may update `display_name` only. A column-level grant or `before update` trigger stops edits to `user_id`, `avatar_url`, `deleted_at` and timestamps from the API.
- Reads of other people's profiles (flatmates) are added by `household` using its membership helper ([ADR-003](adr/003-multi-tenancy-rls.md)).

### Routes and protection

| Route                                          | Who            | Behaviour                                                                                       |
| ---------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------- |
| `/`, `/privacy`                                | anyone         | Public.                                                                                         |
| `/sign-in`                                     | anyone         | Signed-in users are sent on to `next` or `/dashboard`.                                          |
| `/auth/callback`                               | Google flow    | Exchanges the code, sets cookies, redirects to the safe `next` path. On failure: `/auth/error`. |
| `/dashboard` and the rest of the `(app)` group | signed in only | Signed-out users go to `/sign-in?next=<path>`. The page content is never rendered for them.     |
| `/api/health`                                  | anyone         | Unchanged.                                                                                      |

Unauthenticated calls to the database through the API return nothing: every table has RLS and no policy for `anon` ([ADR-003](adr/003-multi-tenancy-rls.md)).

## Commands

Same as foundation: `pnpm check`, `pnpm db:reset`, `pnpm db:test`, `pnpm db:types`, `pnpm test:e2e`.

## Testing strategy

- **Unit (Vitest), written first:** `safe-redirect` (rejects `//evil.com`, `https://evil.com`, `/\evil`, javascript URLs, encoded variants; accepts `/dashboard?x=1`), display-name schema, route guard decisions, delete-account handler (auth required, anonymise before delete, no detail leaks).
- **Database (pgTAP):** profile created on user insert with metadata mapped correctly; long names and non-https avatars handled; user A cannot read, update or delete user B's profile; `anon` gets nothing; users cannot change protected columns; deleting the auth user leaves the profile with `user_id` null; anonymise function result.
- **End-to-end (Playwright, local stack):** a test user is signed in through the local email login and session cookies are injected. Checks: signed-out visit to `/dashboard` redirects to `/sign-in?next=%2Fdashboard`; signed-in user reaches the dashboard and Account page; rename persists; sign out returns to `/sign-in`; sign out everywhere ends a second session; delete account removes access.
- **Manual (real phones):** the Google flow itself, in Android Chrome, iPhone Safari and the installed Home Screen app on both. iOS standalone mode is the known risk (sign-in may open in Safari instead of staying in the app); the result is recorded in the plan.

## Boundaries

- **Always:** validate all input with zod; use `getClaims()` server-side; whitelist redirect targets; keep the service role inside Edge Functions; show the same neutral error for any sign-in failure.
- **Ask first:** adding another sign-in provider; any new dependency; storing anything beyond name, email (held by Supabase Auth), photo URL and timestamps.
- **Never:** store or log tokens, emails or Google IDs in app logs; trust a `next` parameter without checking it; expose the service-role key to the browser; let a user change another user's data.

## Success criteria

1. Google sign-in works on production and on a preview URL, on Android Chrome and iPhone Safari, and in the installed app on both. A profile with the right name and photo exists after the first sign-in.
2. Reopening the installed app days later keeps the session.
3. A signed-out request to any `(app)` route redirects to `/sign-in` and renders none of the page.
4. Sign out clears this device; sign out everywhere invalidates other sessions (tested).
5. pgTAP proves cross-user isolation on `profiles` and that `anon` has no access.
6. Account deletion anonymises the profile, deletes the auth user, and signs the user out (tested end to end locally).
7. The open-redirect tests pass, and `/auth/callback` ignores unsafe `next` values.
8. Privacy page lists exactly what is stored and how to request deletion or a copy of data.
9. `pnpm check`, `pnpm db:test` and `pnpm test:e2e` pass in CI. Lighthouse targets still hold on `/sign-in`.
10. The Google client secret exists only in the Supabase dashboard. Nothing sensitive is in git.

## Risks

| Risk                                                       | Mitigation                                                                                                                             |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| iOS standalone mode breaks the OAuth round trip            | Test on a real iPhone early (first task after the callback exists). Fallback: open sign-in in Safari and return via the callback link. |
| Google consent screen left in "Testing" blocks flatmates   | Publish to production for basic scopes; checked in the setup task.                                                                     |
| Preview deployments cannot sign in (unlisted redirect URL) | Wildcard redirect entry for this Vercel project in Supabase Auth settings.                                                             |
| Deleting a user who owns a household would orphan it       | Out of reach today (no households). `household` adds a rule: owners must transfer or close the flat first.                             |
| Auth rate limits on the free tier                          | Default Supabase limits apply; the sign-in page is only a button, so abuse surface is small.                                           |

## Open questions

1. Will you create the Google Cloud OAuth client yourself (about 10 minutes, I will give exact steps), and are you happy to set the consent screen to **In production**?
2. Should flatmates be able to change their display name freely, or should it be locked to their Google name? (Proposed: editable, 1 to 50 characters.)
3. Do you want a short **terms of use** page now as well as the privacy page, or only privacy? (Proposed: privacy only until real users beyond your flat arrive.)
4. Is the label "Former flatmate" right for deleted accounts?
