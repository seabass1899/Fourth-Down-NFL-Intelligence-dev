# FourthDown P0.2-HF2 — Account Identity and Profile Integration

## Scope
- Shows the authenticated email, display name and signed-in account state in the dashboard header.
- Shows the account UUID in Settings, and allows the signed-in user to edit their own display name through Supabase RLS.
- Loads the profile by the authenticated UUID and clears displayed identity on user change.
- Includes a versioned, repeatable profile trigger/backfill migration, matching the SQL already executed manually in development.
- Wagers, odds calculations, navigation and import logic are unchanged.

## Install on Windows (CMD or PowerShell)
1. Export wagers from the current app and keep a backup of the working `C:\projects\fourthdown-p02` folder.
2. Stop the development server (`Ctrl+C`).
3. Extract the ZIP. Copy the **contents** of its `fourthdown-p02` folder into `C:\projects\fourthdown-p02` (not an extra nested folder). Replace project files, but keep your existing `.env.local`. Avoid copying over unrelated local modifications without reviewing a diff.
4. In `C:\projects\fourthdown-p02`, run `npm install`, `npm test`, `npm run check`, and `npm run build`.
5. Restart via `npm run dev -- -p 3001` and log in.

## SQL migration
Your dev instance already has the two profiles and the trigger from the manually executed SQL. The included `supabase/migrations/20261015000100_hf2_profiles.sql` documents that state for source control. On a new environment, apply the prior migrations in filename order, followed by this migration. On your existing dev project, running it again is generally safe because the trigger is recreated and profile inserts use `ON CONFLICT DO NOTHING`; **do not rerun it solely to test the UI**.

## Acceptance tests
1. Log into Account A, confirm email and display name appear in header and Settings. Rename to `FourthDown Test A`; refresh: name persists.
2. Log out, log in as Account B; confirm Account A's identity is not displayed. Rename B to `FourthDown Test B`; refresh and confirm. Switch back to A; its name remains unchanged.
3. Confirm both users see only their own wagers. Verify the Kyren–Puka historical wager and original settlement are unchanged.
4. Verify `public.profiles` shows two different display names and matching auth UUIDs (using SQL Editor); inspect existing RLS policies. Test direct unauthorized writes separately before commercial approval.
5. Confirm password/email are not displayed in logs or repository, and `.env.local` remains gitignored.

## Known limitations / release gate
- This update does not add account deletion, email change or password-reset UX.
- Owner isolation via RLS was statically inspected; negative authenticated API tests remain necessary.
- Subscriber entitlement enforcement, audit-grade settlement events and canonical parlay leg writes are future work.
- Never check `.env.local` into Git.
