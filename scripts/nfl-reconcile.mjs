
import { createClient } from '@supabase/supabase-js';
import { parse } from 'csv-parse/sync';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizeData, makeInsertPlan } from '../lib/nfl/ingestion-plan.mjs';

const args = new Set(process.argv.slice(2));

if (args.has('--apply')) {
  throw new Error('Database writes are disabled in this version.');
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;

if (!url || !key) {
  throw new Error('Missing Supabase URL or ingestion secret key.');
}

// Prevent accidental connections to another Supabase project.
const expectedProjectRef = 'ainvzzvdclqxlriurrld';
const actualHost = new URL(url).hostname;

if (actualHost !== `${expectedProjectRef}.supabase.co`) {
  throw new Error('Supabase project does not match FourthDown development.');
}

const db = createClient(url, key, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
});

const base = join(tmpdir(), 'fourthdown-nfl-data');

const teams = parse(
  readFileSync(join(base, 'teams.csv')),
  { columns: true, skip_empty_lines: true, bom: true }
);

const games = parse(
  readFileSync(join(base, 'games.csv')),
  { columns: true, skip_empty_lines: true, bom: true }
);

async function fetchAll(table, columns) {
  const rows = [];
  let offset = 0;
  const pageSize = 500;

  while (true) {
    const { data, error } = await db
      .from(table)
      .select(columns)
      .range(offset, offset + pageSize - 1);

    if (error) {
      throw new Error(`${table}: ${error.message}`);
    }

    rows.push(...data);

    if (data.length < pageSize) break;
    offset += pageSize;
  }

  return rows;
}

const normalized = normalizeData(teams, games, {
  season: 2026,
  assumeEasternTime: true
});

const existing = {
  teams: await fetchAll('teams', 'id,name'),
  games: await fetchAll(
    'games',
    'id,season,week,home_team_id,away_team_id,kickoff,status,home_score,away_score'
  ),
  mappings: await fetchAll(
    'data_provider_entities',
    'provider,entity_type,external_id,canonical_id'
  )
};

const plan = makeInsertPlan(normalized, existing);

console.log(JSON.stringify({
  mode: 'LIVE_RECONCILIATION_READ_ONLY',
  season: 2026,
  database_writes: 0,
  existing_counts: {
    teams: existing.teams.length,
    games: existing.games.length,
    mappings: existing.mappings.length
  },
  plan_counts: plan.counts,
  timezone_assumption: 'America/New_York - awaiting upstream confirmation'
}, null, 2));
