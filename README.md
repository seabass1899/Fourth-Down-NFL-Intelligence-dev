# FourthDown — NFL Intelligence P0.1

A private-first NFL analytics UI scaffold designed for eventual subscriber access. **Not a sportsbook.** No bet placement, wagering integration, or live data is present.

## Run locally on Windows / macOS / Linux

Prerequisites: Node.js 22+ and npm; a modern browser.

```powershell
cd C:\projects
# Extract the zip into C:\projects\nfl-intelligence-p0.1
cd nfl-intelligence-p0.1
npm install
npm run dev
```

Open **http://localhost:3000**. Run `npm test` for odds calculation tests and `npm run build` for a production compile. To change ports: `npm run dev -- -p 3001`.

You do **not** need Supabase credentials to try this initial app. Do not deploy it publicly in P0.1.

## Features implemented

- Responsive dark-theme NFL Command Center (schedule example cards are explicitly **static**).
- Personal wager ledger: create, change settlement status, delete, browser persistence, CSV export.
- Profit, ROI, win-rate and settled exposure metrics (pending bets excluded from realized ROI).
- American odds to implied probability, return, and EV sensitivity calculator.
- Model lab milestones, environment readiness view, and privacy notes.
- Sample Kyren Williams 25+ receiving + Puka Nacua 80+ receiving win from 2026-10-12.
- Supabase SQL migration for normalized teams, games, players, odds snapshots, predictions, user wagers, research, and entitlements, with row-level security.
- Node unit tests for odds math and settlement behavior.

## Seed record reconciliation

The historical ticket was user-reported as **$10 wager, approximately $30 returned**. The previously displayed sportsbook odds were **+188**, which mathematically pay **$28.80** total on $10, i.e. $18.80 profit. The seeded ledger uses a **$30 actual-return override** to reflect the user's rounded account. Confirm the settled receipt and amend the override before relying on audited performance. No API connection automatically verifies the result.

## Data/security architecture

**P0.1:** Ledger state lives in localStorage, **not** in Supabase. That means no sync, accounts, reliable backup, or cross-device access. A browser reset can erase it. Export CSV regularly. API endpoints currently expose only `/api/health`; `/api/wagers` intentionally returns HTTP 501 rather than pretending to persist confidential user data.

**P0.2 implementation gate:** Add Supabase Auth, authenticated server-side wager API, per-user access tests, and database persistence. The included migration is a starting schema, not evidence of production readiness. Create a new Supabase project; never share another product's production database. Do not put service role credentials into public environment variables.

**P0.3:** Vet licensed NFL data and permitted derived-data/public redistribution rights. Add provenance, ingestion jobs, snapshot time, rate limiting, auditing and availability monitors. Sport schedule examples must be replaced before real-time claims are displayed.

**P0.4:** Calibrated forecast models, walk-forward testing, data leakage checks, Brier/log loss, error ranges, CLV and proper conditional/correlated parlay modeling. No model-backed prediction is available today.

**Subscriber beta:** Entitlements and billing webhooks operated only from a trusted server, privacy and retention policy, access logging, security testing, processor approval and legal review across target jurisdictions. No user-to-user wager sharing by default.

## Directory

- `app/page.tsx` — client UI
- `app/globals.css` — responsive theme
- `lib/seed.ts` — demonstration schedule and historical record
- `lib/analytics.mjs` — transparent, testable odds and performance formulas
- `supabase/migrations/` — RLS-first initial SQL schema
- `scripts/analytics.test.mjs` — automated math checks

## Do not misinterpret these metrics

A winning ticket and positive realized ROI on one wager are not evidence of skill. The odds-lab estimated probability is user-entered, not model-generated, so positive EV is only a what-if scenario. No subscription fees, payments, wagering, or real-time sportsbooks are integrated in this release.
