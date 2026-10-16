/** Preflight checks to run after makeInsertPlan and before any write. */
export function assertSafeMappings(normalized, existingMappings = []) {
  const expected = new Map([
    ...normalized.teams.map(t => [`nflverse|team|${t.id}`, t.id]),
    ...normalized.games.map(g => [`nflverse|game|${g.id}`, g.id]),
  ]);
  const seen = new Map();
  for (const m of existingMappings) {
    const key = `${m.provider}|${m.entity_type}|${m.external_id}`;
    if (seen.has(key) && seen.get(key) !== m.canonical_id) {
      throw new Error(`Conflicting provider mappings: ${key}`);
    }
    seen.set(key, m.canonical_id);
    if (expected.has(key) && expected.get(key) !== m.canonical_id) {
      throw new Error(`Provider mapping points to different canonical ID: ${key}`);
    }
  }
}

/** Fail rather than silently reinterpret existing kickoff times. */
export function assertValidExistingGames(existingGames = []) {
  for (const g of existingGames) {
    if (!g.id || !g.kickoff || Number.isNaN(Date.parse(g.kickoff))) {
      throw new Error(`Invalid existing game ID or kickoff: ${g.id ?? 'unknown'}`);
    }
  }
}

export function assertSafePlan(plan) {
  const collections = ['teamInserts', 'teamUpdates', 'gameInserts', 'gameUpdates', 'mappingInserts'];
  for (const name of collections) {
    if (!Array.isArray(plan[name])) throw new Error(`Missing plan collection: ${name}`);
  }
  for (const g of plan.gameUpdates) {
    if (Object.keys(g).some(k => !['id', 'kickoff'].includes(k))) {
      throw new Error(`Unexpected game update field: ${g.id}`);
    }
  }
}
