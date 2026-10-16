/**
 * P0.3A-3C: READ-ONLY live reconciliation, preflight guards, and write gate.
 * --apply is intentionally DISABLED pending source timezone and license review.
 * Run: node --env-file=.env.local scripts/nfl-ingest-guarded.mjs --assume-eastern
 */
import { createClient } from '@supabase/supabase-js';
import { parse } from 'csv-parse/sync';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizeData, makeInsertPlan } from '../lib/nfl/ingestion-plan.mjs';
import { assertSafeMappings, assertValidExistingGames, assertSafePlan } from '../lib/nfl/ingestion-guards.mjs';

const args = new Set(process.argv.slice(2));
if (args.has('--apply')) throw new Error('APPLY BLOCKED: source timezone, status semantics, and license approval are pending. No database changes made.');
if (!args.has('--assume-eastern')) throw new Error('Preview requires explicit --assume-eastern acknowledgement.');
if ([...args].some(a => a !== '--assume-eastern')) throw new Error('Unknown command-line option.');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY.');
const expectedHost = 'ainvzzvdclqxlriurrld.supabase.co';
if (new URL(url).hostname !== expectedHost) throw new Error('Unexpected destination: this is not the FourthDown development project.');
const db = createClient(url, key, {auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});

const folder = join(tmpdir(), 'fourthdown-nfl-data');
const load = (file) => parse(readFileSync(join(folder,file)), {columns:true,skip_empty_lines:true,bom:true});
const normalized = normalizeData(load('teams.csv'), load('games.csv'), {season:2026,assumeEasternTime:true});

async function fetchAll(table, fields) {
  const rows = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    // Stable ordering prevents pagination gaps on a static dataset.
    const {data,error} = await db.from(table).select(fields).order('id', {ascending:true}).range(offset,offset+pageSize-1);
    if (error) throw new Error(`Read ${table} failed: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) return rows;
  }
}

const existing = {
  teams: await fetchAll('teams','id,name'),
  games: await fetchAll('games','id,season,week,home_team_id,away_team_id,kickoff,status,home_score,away_score'),
  mappings: await fetchAll('data_provider_entities','id,provider,entity_type,external_id,canonical_id'),
};
assertValidExistingGames(existing.games);
assertSafeMappings(normalized, existing.mappings);
const plan = makeInsertPlan(normalized, existing);
assertSafePlan(plan);
console.log(JSON.stringify({
  mode:'GUARDED_LIVE_PREVIEW',
  season:2026,
  database_writes:0,
  existing_counts:Object.fromEntries(Object.entries(existing).map(([k,v])=>[k,v.length])),
  plan_counts:plan.counts,
  notices:[
    'This preview uses an unverified America/New_York source-time assumption.',
    'No game can be promoted to final based only on populated scores.',
    'No --apply available until source license and timezone reviews complete.'
  ]
},null,2));
