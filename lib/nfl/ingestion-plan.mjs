import { DateTime } from 'luxon';

export const DEFAULT_SEASON = 2026;
export const TEAM_COUNT = 32;
export const REGULAR_SEASON_GAME_COUNT = 272;
const ID = /^[A-Z0-9]{2,4}$/;

const value = v => String(v ?? '').trim();
function requireValue(v, label) { const s = value(v); if (!s) throw new Error(`Missing ${label}`); return s; }
function score(v, label) {
  if (value(v) === '') return null;
  if (!/^\d+$/.test(value(v))) throw new Error(`Invalid ${label}: ${v}`);
  const n = Number(v);
  if (!Number.isSafeInteger(n)) throw new Error(`Invalid ${label}: ${v}`);
  return n;
}
function requireNoDuplicates(items, type) {
  const ids = new Set();
  for (const item of items) {
    if (ids.has(item.id)) throw new Error(`Duplicate ${type}: ${item.id}`);
    ids.add(item.id);
  }
}

export function normalizeData(teamRows, gameRows, {
  season = DEFAULT_SEASON,
  enforceExpectedCounts = true,
  assumeEasternTime = false,
} = {}) {
  if (!Number.isInteger(season) || season < 2000) throw new Error('Invalid season');
  if (!assumeEasternTime) throw new Error('Kickoff timezone assumption is not approved; supply --assume-eastern after review');
  const sourceTeams = teamRows.filter(r => Number(r.season) === season);
  const sourceGames = gameRows.filter(r => Number(r.season) === season && value(r.game_type) === 'REG');
  if (enforceExpectedCounts && sourceTeams.length !== TEAM_COUNT) throw new Error(`Expected ${TEAM_COUNT} team records, got ${sourceTeams.length}`);
  if (enforceExpectedCounts && sourceGames.length !== REGULAR_SEASON_GAME_COUNT) throw new Error(`Expected ${REGULAR_SEASON_GAME_COUNT} regular-season games, got ${sourceGames.length}`);
  const teams = sourceTeams.map(row => {
    const id = requireValue(row.team, 'team ID').toUpperCase();
    if (!ID.test(id)) throw new Error(`Invalid team ID: ${id}`);
    return { id, name: requireValue(row.full, `${id} team name`) };
  });
  requireNoDuplicates(teams, 'team ID');
  const known = new Set(teams.map(t => t.id));
  const games = sourceGames.map(row => {
    const id = requireValue(row.game_id, 'game ID');
    const home_team_id = requireValue(row.home_team, `${id} home team`).toUpperCase();
    const away_team_id = requireValue(row.away_team, `${id} away team`).toUpperCase();
    if (!known.has(home_team_id) || !known.has(away_team_id) || home_team_id === away_team_id) throw new Error(`${id}: invalid team association`);
    const week = Number(row.week);
    if (!Number.isInteger(week) || week < 1 || week > 18) throw new Error(`${id}: invalid regular-season week`);
    const rawDate = `${requireValue(row.gameday, `${id} gameday`)} ${requireValue(row.gametime, `${id} gametime`)}`;
    const dt = DateTime.fromFormat(rawDate, 'yyyy-MM-dd HH:mm', { zone: 'America/New_York', setZone: true });
    if (!dt.isValid || dt.toFormat('yyyy-MM-dd HH:mm') !== rawDate) throw new Error(`${id}: invalid Eastern kickoff ${rawDate}`);
    const home_score = score(row.home_score, `${id} home score`);
    const away_score = score(row.away_score, `${id} away score`);
    if ((home_score === null) !== (away_score === null)) throw new Error(`${id}: partial score`);
    return { id, season, week, home_team_id, away_team_id, kickoff: dt.toUTC().toISO(), status: 'unverified', home_score, away_score };
  });
  requireNoDuplicates(games, 'game ID');
  return { season, teams, games, provider: 'nflverse', timezone_assumption: 'America/New_York (unverified)' };
}

export function makeInsertPlan(normalized, existing = { teams: [], games: [], mappings: [] }) {
  const existingTeams = new Map((existing.teams ?? []).map(x => [x.id, x]));
  const existingGames = new Map((existing.games ?? []).map(x => [x.id, x]));
  const mappingKeys = new Set((existing.mappings ?? []).map(x => `${x.provider}|${x.entity_type}|${x.external_id}`));
  const teamInserts = [], teamUpdates = [], gameInserts = [], gameUpdates = [], mappingInserts = [];
  const reject = [];
  for (const t of normalized.teams) {
    const old = existingTeams.get(t.id);
    if (!old) teamInserts.push(t);
    else if (old.name !== t.name) teamUpdates.push(t);
    const mk = `nflverse|team|${t.id}`;
    if (!mappingKeys.has(mk)) mappingInserts.push({ provider: 'nflverse', entity_type: 'team', external_id: t.id, canonical_id: t.id });
  }
  for (const g of normalized.games) {
    const old = existingGames.get(g.id);
    if (!old) gameInserts.push(g);
    else {
      if (old.season !== g.season || old.week !== g.week || old.home_team_id !== g.home_team_id || old.away_team_id !== g.away_team_id) {
        reject.push({ id: g.id, reason: 'Existing game identity/matchup differs from source' });
      } else if (old.status === 'final' || old.status === 'completed') {
        // A verified final game is immutable to this unverified source.
      } else if (old.kickoff !== g.kickoff) {
        // Only permit a kickoff update. Never overwrite existing scores or promote an unverified status.
        gameUpdates.push({ id: g.id, kickoff: g.kickoff });
      }
    }
    const mk = `nflverse|game|${g.id}`;
    if (!mappingKeys.has(mk)) mappingInserts.push({ provider: 'nflverse', entity_type: 'game', external_id: g.id, canonical_id: g.id });
  }
  if (reject.length) throw new Error(`Unsafe existing game collisions: ${JSON.stringify(reject.slice(0, 5))}`);
  return { teamInserts, teamUpdates, gameInserts, gameUpdates, mappingInserts,
    counts: { teams: normalized.teams.length, games: normalized.games.length, insert_teams: teamInserts.length, insert_games: gameInserts.length, insert_mappings: mappingInserts.length, update_teams: teamUpdates.length, update_games: gameUpdates.length } };
}
