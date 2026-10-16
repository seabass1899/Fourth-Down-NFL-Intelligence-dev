-- FourthDown P0.3A-3D: restricted, atomic NFL roster/schedule ingestion.
-- Source scores and final-game claims are rejected in this phase.
-- Audit records_processed counts validated input (304), while return fields count newly inserted rows.
BEGIN;

CREATE OR REPLACE FUNCTION public.ingest_nfl_schedule_v1(
  p_provider text,
  p_season integer,
  p_teams jsonb,
  p_games jsonb,
  p_source_reference text DEFAULT NULL,
  p_source_license text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_team_count integer := 0;
  v_game_count integer := 0;
  v_mapping_count integer := 0;
  v_run_id uuid;
BEGIN
  -- This check is defense in depth; EXECUTE is also limited to service_role.
  IF current_user <> 'service_role' THEN
    RAISE EXCEPTION 'ingestion requires service_role';
  END IF;
  IF p_provider IS DISTINCT FROM 'nflverse' OR p_season IS DISTINCT FROM 2026 THEN
    RAISE EXCEPTION 'unsupported provider or season';
  END IF;
  IF jsonb_typeof(p_teams) IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_games) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_teams) <> 32
     OR jsonb_array_length(p_games) <> 272 THEN
    RAISE EXCEPTION 'expected 32 teams and 272 regular-season games';
  END IF;
  IF p_source_reference IS NULL OR btrim(p_source_reference) = '' THEN
    RAISE EXCEPTION 'source reference is required';
  END IF;

  -- Serialize this ingestion function for one provider and season.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('FourthDown:nflverse:schedule:' || p_season::text));

  -- Validate complete input set before writing anything.
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_teams) AS t(id text, name text)
    WHERE t.id IS NULL OR t.id !~ '^[A-Z0-9]{2,4}$' OR NULLIF(btrim(t.name), '') IS NULL
  ) THEN RAISE EXCEPTION 'invalid team record'; END IF;
  IF (SELECT count(DISTINCT id) FROM jsonb_to_recordset(p_teams) AS t(id text)) <> 32 THEN
    RAISE EXCEPTION 'duplicate team IDs';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_games) AS g(
      id text, season integer, week integer, home_team_id text,
      away_team_id text, kickoff timestamptz, status text,
      home_score integer, away_score integer)
    WHERE id IS NULL OR id !~ '^2026_(0[1-9]|1[0-8])_[A-Z0-9]{2,4}_[A-Z0-9]{2,4}$' OR season <> p_season
      OR season IS NULL OR week NOT BETWEEN 1 AND 18
      OR kickoff IS NULL OR home_team_id IS NULL OR away_team_id IS NULL
      OR home_team_id = away_team_id
      OR status IS DISTINCT FROM 'unverified'
  ) THEN RAISE EXCEPTION 'invalid game record'; END IF;
  IF (SELECT count(DISTINCT id) FROM jsonb_to_recordset(p_games) AS g(id text)) <> 272 THEN
    RAISE EXCEPTION 'duplicate game IDs';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_games) AS g(home_team_id text, away_team_id text)
    WHERE NOT EXISTS (SELECT 1 FROM jsonb_to_recordset(p_teams) AS t(id text) WHERE t.id = g.home_team_id)
       OR NOT EXISTS (SELECT 1 FROM jsonb_to_recordset(p_teams) AS t(id text) WHERE t.id = g.away_team_id)
  ) THEN RAISE EXCEPTION 'unknown team in game record'; END IF;

  -- Existing canonical identities and mappings are immutable during this stage.
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_teams) AS t(id text, name text)
    JOIN public.teams e ON e.id = t.id
    WHERE e.name IS DISTINCT FROM t.name
  ) THEN RAISE EXCEPTION 'existing team identity conflicts with provider'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_games) AS g(
      id text, season integer, week integer, home_team_id text,
      away_team_id text, kickoff timestamptz)
    JOIN public.games e ON e.id = g.id
    WHERE e.season IS DISTINCT FROM g.season OR e.week IS DISTINCT FROM g.week
       OR e.home_team_id IS DISTINCT FROM g.home_team_id
       OR e.away_team_id IS DISTINCT FROM g.away_team_id
       OR e.kickoff IS DISTINCT FROM g.kickoff
  ) THEN RAISE EXCEPTION 'existing game identity or kickoff conflicts with provider'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.data_provider_entities m
    WHERE m.provider = p_provider
      AND ((m.entity_type = 'team' AND EXISTS (
          SELECT 1 FROM jsonb_to_recordset(p_teams) AS t(id text)
          WHERE t.id = m.external_id AND t.id <> m.canonical_id))
        OR (m.entity_type = 'game' AND EXISTS (
          SELECT 1 FROM jsonb_to_recordset(p_games) AS g(id text)
          WHERE g.id = m.external_id AND g.id <> m.canonical_id)))
  ) THEN RAISE EXCEPTION 'provider mapping conflict'; END IF;

  -- Persist teams before games to satisfy the parent foreign keys.
  INSERT INTO public.teams(id, name)
  SELECT id, name FROM jsonb_to_recordset(p_teams) AS t(id text, name text)
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_team_count = ROW_COUNT;

  -- Never import unverified scores. They remain NULL until a verified result pipeline exists.
  INSERT INTO public.games(id, season, week, home_team_id, away_team_id, kickoff, status, home_score, away_score)
  SELECT id, season, week, home_team_id, away_team_id, kickoff, 'unverified', NULL, NULL
  FROM jsonb_to_recordset(p_games) AS g(
    id text, season integer, week integer, home_team_id text,
    away_team_id text, kickoff timestamptz)
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_game_count = ROW_COUNT;

  INSERT INTO public.data_provider_entities(provider, entity_type, external_id, canonical_id)
  SELECT p_provider, 'team', id, id
  FROM jsonb_to_recordset(p_teams) AS t(id text)
  UNION ALL
  SELECT p_provider, 'game', id, id
  FROM jsonb_to_recordset(p_games) AS g(id text)
  ON CONFLICT (provider, entity_type, external_id) DO NOTHING;
  GET DIAGNOSTICS v_mapping_count = ROW_COUNT;

  -- Recheck after INSERT ... DO NOTHING, including conflicting external writers.
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_teams) AS t(id text, name text)
    JOIN public.teams e USING (id) WHERE e.name IS DISTINCT FROM t.name
  ) OR EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_games) AS g(
      id text, season integer, week integer, home_team_id text, away_team_id text, kickoff timestamptz)
    JOIN public.games e USING (id)
    WHERE e.season IS DISTINCT FROM g.season OR e.week IS DISTINCT FROM g.week
       OR e.home_team_id IS DISTINCT FROM g.home_team_id
       OR e.away_team_id IS DISTINCT FROM g.away_team_id
       OR e.kickoff IS DISTINCT FROM g.kickoff
  ) OR EXISTS (
    SELECT 1 FROM public.data_provider_entities m
    WHERE m.provider = p_provider
      AND ((m.entity_type = 'team' AND EXISTS (
          SELECT 1 FROM jsonb_to_recordset(p_teams) AS t(id text)
          WHERE t.id = m.external_id AND t.id <> m.canonical_id))
        OR (m.entity_type = 'game' AND EXISTS (
          SELECT 1 FROM jsonb_to_recordset(p_games) AS g(id text)
          WHERE g.id = m.external_id AND g.id <> m.canonical_id)))
  ) THEN RAISE EXCEPTION 'post-insert identity or mapping conflict'; END IF;

  INSERT INTO public.data_ingestion_runs(
    provider, dataset, status, started_at, completed_at,
    records_received, records_processed, records_failed, source_reference, source_license)
  VALUES (
    p_provider, 'teams_and_2026_regular_schedule', 'completed', now(), now(),
    304, 304, 0, p_source_reference, p_source_license)
  RETURNING id INTO v_run_id;

  RETURN jsonb_build_object('run_id', v_run_id, 'inserted_teams', v_team_count,
    'inserted_games', v_game_count, 'inserted_mappings', v_mapping_count,
    'database_transaction', 'executed');
END;
$$;

REVOKE ALL ON FUNCTION public.ingest_nfl_schedule_v1(text,integer,jsonb,jsonb,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_nfl_schedule_v1(text,integer,jsonb,jsonb,text,text) TO service_role;

COMMIT;
