import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { parse } from 'csv-parse/sync';
import { normalizeData } from '../lib/nfl/ingestion-plan.mjs';

const container = 'supabase_db_nfl-intelligence-p01.1';
const source = join(tmpdir(), 'fourthdown-nfl-data');

function readCsv(name) {
  return parse(readFileSync(join(source, name)), {
    columns: true,
    skip_empty_lines: true,
    bom: true
  });
}

const normalized = normalizeData(
  readCsv('teams.csv'),
  readCsv('games.csv'),
  { season: 2026, assumeEasternTime: true }
);

const teams = normalized.teams.map(({ id, name }) => ({ id, name }));
const games = normalized.games.map(g => ({
  id: g.id,
  season: g.season,
  week: g.week,
  home_team_id: g.home_team_id,
  away_team_id: g.away_team_id,
  kickoff: g.kickoff,
  status: 'unverified',
  home_score: null,
  away_score: null
}));

if (teams.length !== 32 || games.length !== 272) {
  throw new Error('Unexpected NFL payload size');
}

const literal = value =>
  "'" + JSON.stringify(value).replaceAll("'", "''") + "'::jsonb";

const sql = `
\\set ON_ERROR_STOP on

DO $check$
BEGIN
  IF (SELECT count(*) FROM public.teams) <> 0
     OR (SELECT count(*) FROM public.games) <> 0
     OR (SELECT count(*) FROM public.data_provider_entities) <> 0
     OR (SELECT count(*) FROM public.data_ingestion_runs) <> 0
  THEN
    RAISE EXCEPTION 'Local test requires empty ingestion tables';
  END IF;
END
$check$;

BEGIN;
SET LOCAL ROLE service_role;

SELECT public.ingest_nfl_schedule_v1(
  'nflverse',
  2026,
  ${literal(teams)},
  ${literal(games)},
  'local-atomic-rollback-test',
  NULL
);

DO $check$
BEGIN
  IF (SELECT count(*) FROM public.teams) <> 32
     OR (SELECT count(*) FROM public.games) <> 272
     OR (SELECT count(*) FROM public.data_provider_entities) <> 304
     OR (SELECT count(*) FROM public.data_ingestion_runs) <> 1
  THEN
    RAISE EXCEPTION 'In-transaction record counts are incorrect';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.games
    WHERE home_score IS NOT NULL OR away_score IS NOT NULL
       OR status IS DISTINCT FROM 'unverified'
  ) THEN
    RAISE EXCEPTION 'Unverified game data was modified incorrectly';
  END IF;

  RAISE NOTICE 'PASS: All 609 expected records exist inside transaction';
END
$check$;

ROLLBACK;

DO $check$
BEGIN
  IF (SELECT count(*) FROM public.teams) <> 0
     OR (SELECT count(*) FROM public.games) <> 0
     OR (SELECT count(*) FROM public.data_provider_entities) <> 0
     OR (SELECT count(*) FROM public.data_ingestion_runs) <> 0
  THEN
    RAISE EXCEPTION 'ROLLBACK FAILED: records remain';
  END IF;

  RAISE NOTICE 'PASS: Rollback restored all four tables to zero';
END
$check$;
`;

const result = spawnSync('docker', [
  'exec', '-i', container,
  'psql', '-X', '-v', 'ON_ERROR_STOP=1',
  '-U', 'postgres', '-d', 'postgres'
], {
  input: sql,
  encoding: 'utf8',
  stdio: ['pipe', 'inherit', 'inherit']
});

if (result.error) throw result.error;
if (result.status !== 0) {
  throw new Error(`Local PostgreSQL test failed: ${result.status}`);
}

console.log('PASS: Local-only atomic rollback integration test');
