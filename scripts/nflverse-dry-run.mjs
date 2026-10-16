/** FourthDown P0.3A — read-only nflverse 2026 regular season normalization. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import { DateTime } from 'luxon';

const season = Number(process.env.FD_NFL_SEASON ?? 2026);
const sourceDir = process.env.FD_NFL_DATA_DIR ?? path.join(os.tmpdir(), 'fourthdown-nfl-data');
const teamsPath = path.join(sourceDir, 'teams.csv');
const gamesPath = path.join(sourceDir, 'games.csv');
const expectedTeams = 32;
const expectedGames = 272;
const errors = [];
function fail(msg) { errors.push(msg); }
function must(value, label) { if (value === undefined || value === null || String(value).trim() === '') fail(`Missing ${label}`); return String(value ?? '').trim(); }
function loadCsv(file) {
  if (!fs.existsSync(file)) throw new Error(`Missing CSV: ${file}`);
  return parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''), {
    columns: true, skip_empty_lines: true, bom: true, relax_quotes: false,
  });
}
function unique(items, label) {
  const seen = new Set();
  for (const item of items) { if (seen.has(item)) fail(`Duplicate ${label}: ${item}`); seen.add(item); }
}
function parseScore(raw, label) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) { fail(`Invalid ${label}: ${raw}`); return null; }
  return n;
}

try {
  const allTeams = loadCsv(teamsPath);
  const allGames = loadCsv(gamesPath);
  const sourceTeams = allTeams.filter(row => Number(row.season) === season);
  const sourceGames = allGames.filter(row => Number(row.season) === season && row.game_type === 'REG');
  if (sourceTeams.length !== expectedTeams) fail(`Expected ${expectedTeams} team rows, found ${sourceTeams.length}`);
  if (sourceGames.length !== expectedGames) fail(`Expected ${expectedGames} regular-season games, found ${sourceGames.length}`);
  const teams = sourceTeams.map((row, index) => ({
    id: must(row.team, `team[${index}].team`),
    name: must(row.full, `team[${index}].full`),
    provider: 'nflverse', external_id: must(row.team, `team[${index}].external_id`),
  }));
  unique(teams.map(t => t.id), 'team ID');
  const teamIds = new Set(teams.map(t => t.id));
  const games = sourceGames.map((row, index) => {
    const id = must(row.game_id, `game[${index}].game_id`);
    const home = must(row.home_team, `${id}.home_team`);
    const away = must(row.away_team, `${id}.away_team`);
    if (!teamIds.has(home)) fail(`${id}: unknown home team ${home}`);
    if (!teamIds.has(away)) fail(`${id}: unknown away team ${away}`);
    if (home === away) fail(`${id}: identical home and away teams`);
    const week = Number(row.week);
    if (!Number.isInteger(week) || week < 1 || week > 18) fail(`${id}: invalid regular-season week ${row.week}`);
    const localTime = `${must(row.gameday, `${id}.gameday`)} ${must(row.gametime, `${id}.gametime`)}`;
    // nflverse game schedules conventionally list times in ET; confirm with provider before production.
    const kickoff = DateTime.fromFormat(localTime, 'yyyy-MM-dd HH:mm', { zone: 'America/New_York', setZone: true });
    if (!kickoff.isValid || kickoff.toFormat('yyyy-MM-dd HH:mm') !== localTime) fail(`${id}: invalid Eastern kickoff ${localTime}`);
    const homeScore = parseScore(row.home_score, `${id}.home_score`);
    const awayScore = parseScore(row.away_score, `${id}.away_score`);
    if ((homeScore === null) !== (awayScore === null)) fail(`${id}: one-sided score`);
    // Never infer 'final' just from scored fields. This adapter does not publish game status.
    return {
      id, season, week, game_type: 'REG', home_team_id: home, away_team_id: away,
      kickoff: kickoff.isValid ? kickoff.toUTC().toISO() : null,
      home_score: homeScore, away_score: awayScore,
      status: 'unverified', provider: 'nflverse', external_id: id,
    };
  });
  unique(games.map(g => g.id), 'game ID');
  const scored = games.filter(g => g.home_score !== null).length;
  const report = {
    mode: 'DRY_RUN_ONLY', season, source_directory: sourceDir,
    teams: teams.length, regular_season_games: games.length,
    scored_games: scored, unscored_games: games.length - scored,
    source: { teams: 'nfldata/data/teams.csv', games: 'nflverse-data/releases/schedules/games.csv' },
    timezone_assumption: 'America/New_York; confirm upstream documentation before production',
    database_writes: 0, validation_errors: errors.length,
    errors: errors.slice(0, 30),
    sample_teams: teams.slice(0, 3), sample_games: games.slice(0, 3),
  };
  console.log(JSON.stringify(report, null, 2));
  if (errors.length) process.exitCode = 1;
} catch (error) {
  console.error('DRY RUN FAILED:', error.message);
  process.exitCode = 1;
}
