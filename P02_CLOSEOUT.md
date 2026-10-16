# FourthDown P0.2 closeout candidate — UUID importer fix

## Scope
- Replaces fixed fallback UUID with a stable user-scoped, per-record SHA-256-derived UUID.
- Reviews existing authenticated database records before importing, so previously imported records (including the Kyren–Puka wager with the old fallback ID) are skipped.
- Skips repeated legacy data within one import and rejects invalid records.
- Makes Settings distinguish Supabase-connected local development from browser-only demo mode.
- Requires no schema migration; **do not rerun existing SQL**.

## Installation (preserve your working P0.2)
1. In FourthDown, export your wager CSV, retain a separate original copy, and confirm both wager records are visible in Supabase.
2. Stop the local dev server (`Ctrl+C`). Back up `C:\projects\fourthdown-p02` by copying the folder or creating a ZIP. Keep `.env.local` private and unchanged.
3. Extract this archive. Copy the **contents** of its `fourthdown-p02` folder into `C:\projects\fourthdown-p02`, overwriting only application files. Do not overwrite `.env.local` or delete local folders.
4. In PowerShell: `cd C:\projects\fourthdown-p02` then `npm install`, `npm test`, `npm run check`, `npm run build`.
5. After the build passes, start `npm run dev -- -p 3001`. Use existing credentials; confirm the historical wager and test wager still appear. Do not import again unless there really is additional legacy data.
6. Delete the **temporary** persistence test wager through the app, refresh the browser and the Supabase wagers table, and verify only the real wager remains.

## Final acceptance gates (must be verified on your machine)
- Production build (`npm run build`) and TypeScript (`npm run check`) pass.
- Read/insert/update/delete of own wagers works and survives sign-out/sign-in.
- A separately registered second account cannot select, update, or delete account A's wager, including by explicitly trying the known wager UUID. RLS must remain enabled; do not test using postgres/service_role because they bypass RLS.
- Individual structured parlay legs: database schema exists, but automatic UI writing of legs is **not implemented**. Keep as an open P0.3/commercial requirement.
- Settlement audit event writer is **not implemented**. Keep as an open commercial release blocker.
- Accounting: verify displayed actual $30 settlement against the original DraftKings receipt; +188 on $10 mathematically returns $28.80.
- Email/SMTP provider, recovery flows, data licenses, permissions, regulatory and payment review are separate launch gates.

## Security reminders
- Never upload `.env.local`, service-role/secret keys, database passwords, or authenticated request headers.
- This patch changes no DB policies or migrations.

## Test status in build environment
- `npm test`: 7 passed / 0 failed.
- `npm ci --offline`: blocked because the local package cache lacks victory-vendor. Therefore TypeScript and Next.js production build could not be run here; run them locally before acceptance.

## Limitation
The duplicate heuristic matches normalized event, date, selections, market, sportsbook, odds and stake to previously imported records. If a user genuinely placed two identical bets, the importer may classify them as duplicates. A production-grade importer should persist a dedicated `(user_id, source_system, source_record_id)` mapping and present a per-record review UI. Do not advertise automated bulk migrations to subscribers until this is done.
