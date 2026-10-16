# FourthDown P0.2 — installation and acceptance

## Before you begin
1. In the working P0.1 application, **Export CSV** from the Wager Ledger. Keep a separate backup. Do not delete browser storage.
2. Work on your `develop` Git branch, not `main`.
3. Use your **development** Supabase project only.

## Database
In Supabase Dashboard > SQL Editor, run these files **once, in order**:
1. `supabase/migrations/20261013000100_foundation.sql` (only if not run already)
2. `supabase/migrations/20261014000100_p02_wager_legs.sql`

Do not rerun foundation if policies already exist; `create policy` is not idempotent. If unsure, inspect the Database > Tables pane first. The P0.2 leg and settlement tables are schema foundation; the initial UI still captures wager selections as text. Structured leg editing and an immutable settlement writer are **not** implemented yet.

## Windows local install
1. Save your current `git status` output. Copy P0.2 files into the existing project, preserving your private `.env.local` and `.git` folder, or extract to a new directory to review changes first.
2. In project root `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
   ```
   Do not expose your service-role key, database password, or JWT secret.
3. `npm install`
4. `npm run check`
5. `npm test`
6. `npm run dev`
7. Navigate to http://localhost:3000. You should see the sign-in form (rather than the original demo dashboard). Create a development account, confirm email if configured, then sign in.

## Acceptance tests
1. Register / sign in, reload and verify session remains active.
2. Use **Import local wagers** if displayed. Confirm your original Kyren/Puka ticket appears exactly once. The original P0.1 demo has a non-UUID ID; import remaps it to a stable UUID. Confirm the reported ~$30 payout with the actual receipt.
3. Create a test wager and refresh. Verify it persists; update result then delete it.
4. Sign out, create a second test account, and confirm it **cannot see** the first account's wagers. For full security assurance also test RLS using the Supabase SQL test harness and user JWTs before launch.
5. Export CSV to confirm backup works.

## Important limits
- P0.2 is a **development test candidate**, not a production release. UI behavior, database connectivity, complete build and user-isolation security have not been tested in a live Supabase environment in this package.
- Sample schedule remains static. No odds feed, subscription billing, verified model projections or sportsbook actions.
- P0.2 uses browser Supabase auth and client-side gating. Server-side middleware / SSR route protection is a future hardening milestone. The Supabase RLS policies are the actual data-isolation boundary.
- No audit events are written yet. The settlement events table is reserved for a future trusted write service.
