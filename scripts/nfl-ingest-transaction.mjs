// P0.3A-3D: authorization-free preflight for the transactional RPC.
// DO NOT send a privileged RPC until source license/timezone approval.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse } from 'csv-parse/sync';
import { normalizeData } from '../lib/nfl/ingestion-plan.mjs';
import { createHash } from 'node:crypto';

const argv = process.argv.slice(2);
if (argv.includes('--apply')) {
  console.error('BLOCKED: P0.3A-3D cannot apply until timezone and redistribution licensing are approved.');
  process.exit(2);
}
if (argv.some(a => !['--assume-eastern'].includes(a))) {
  throw new Error('Unknown argument; only --assume-eastern is supported for preview');
}
if (!argv.includes('--assume-eastern')) throw new Error('Preview requires --assume-eastern');

const sourceDir = join(tmpdir(), 'fourthdown-nfl-data');
const readCsv = filename => parse(readFileSync(join(sourceDir, filename)), {
  columns: true, skip_empty_lines: true, bom: true
});
const normalized = normalizeData(readCsv('teams.csv'), readCsv('games.csv'), {
  season: 2026, assumeEasternTime: true
});
const teams = normalized.teams.map(t => ({ id: t.id, name: t.name }));
const games = normalized.games.map(g => ({
  id: g.id, season: g.season, week: g.week, home_team_id: g.home_team_id,
  away_team_id: g.away_team_id, kickoff: g.kickoff,
  status: 'unverified', home_score: null, away_score: null
}));
const signature = createHash('sha256')
  .update(JSON.stringify({teams, games})).digest('hex');
console.log(JSON.stringify({
  mode: 'TRANSACTIONAL_WRITER_PREVIEW_ONLY',
  rpc: 'public.ingest_nfl_schedule_v1',
  payload_teams: teams.length, payload_games: games.length,
  scores_sent_to_database: 0, database_writes: 0,
  payload_sha256: signature,
  approval_gates: ['upstream timezone verification', 'source licensing confirmation', 'RPC deployment and integration testing'],
  note: 'This package stages a restricted writer migration. --apply is intentionally disabled.'
}, null, 2));
