/** Local read-only P0.3A-3A ingestion plan. No Supabase credentials or database writes. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import { normalizeData, makeInsertPlan } from '../lib/nfl/ingestion-plan.mjs';
const args = new Set(process.argv.slice(2));
if (args.has('--apply')) { console.error('Apply mode is deliberately disabled in P0.3A-3A.'); process.exit(2); }
const dir = process.env.FD_NFL_DATA_DIR || path.join(os.tmpdir(), 'fourthdown-nfl-data');
function readCsv(file) { return parse(fs.readFileSync(path.join(dir, file), 'utf8'), { columns: true, skip_empty_lines: true, bom: true }); }
try {
  const normalized = normalizeData(readCsv('teams.csv'), readCsv('games.csv'), { season: Number(process.env.FD_NFL_SEASON ?? 2026), assumeEasternTime: args.has('--assume-eastern') });
  const plan = makeInsertPlan(normalized);
  console.log(JSON.stringify({ mode: 'PREVIEW_ONLY', database_writes: 0, requires_timezone_confirmation: true,
    counts: plan.counts, sample_team: plan.teamInserts[0], sample_game: plan.gameInserts[0], sample_mapping: plan.mappingInserts[0],
    note: 'Counts assume empty NFL data tables; no remote database queried. --apply deliberately disabled.' }, null, 2));
} catch (e) { console.error('INGEST PLAN FAILED:', e.message); process.exitCode = 1; }
