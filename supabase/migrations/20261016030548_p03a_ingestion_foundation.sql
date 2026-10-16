
-- FourthDown P0.3A: Provider identity and ingestion audit foundation
-- Adds infrastructure only; does not modify existing P0.2 tables.

BEGIN;

CREATE TABLE public.data_provider_entities (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    provider text NOT NULL CHECK (length(trim(provider)) > 0),
    entity_type text NOT NULL
        CHECK (entity_type IN ('team', 'player', 'game')),
    external_id text NOT NULL CHECK (length(trim(external_id)) > 0),
    canonical_id text NOT NULL CHECK (length(trim(canonical_id)) > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT data_provider_entities_external_key
        UNIQUE (provider, entity_type, external_id)
);

CREATE INDEX data_provider_entities_canonical_idx
ON public.data_provider_entities (entity_type, canonical_id);

CREATE TABLE public.data_ingestion_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    provider text NOT NULL CHECK (length(trim(provider)) > 0),
    dataset text NOT NULL CHECK (length(trim(dataset)) > 0),
    status text NOT NULL DEFAULT 'running'
        CHECK (status IN ('running', 'completed', 'failed', 'partial')),
    started_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    records_received integer NOT NULL DEFAULT 0
        CHECK (records_received >= 0),
    records_processed integer NOT NULL DEFAULT 0
        CHECK (records_processed >= 0),
    records_failed integer NOT NULL DEFAULT 0
        CHECK (records_failed >= 0),
    source_reference text,
    source_license text,
    error_summary text,
    CONSTRAINT data_ingestion_runs_completion_check
        CHECK (completed_at IS NULL OR completed_at >= started_at)
);

CREATE INDEX data_ingestion_runs_lookup_idx
ON public.data_ingestion_runs (provider, dataset, started_at DESC);

CREATE TABLE public.data_ingestion_errors (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ingestion_run_id uuid NOT NULL
        REFERENCES public.data_ingestion_runs(id) ON DELETE CASCADE,
    external_record_id text,
    error_code text NOT NULL,
    error_message text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX data_ingestion_errors_run_idx
ON public.data_ingestion_errors (ingestion_run_id);

-- Subscriber sessions must not access ingestion internals.
ALTER TABLE public.data_provider_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_ingestion_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_ingestion_errors ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.data_provider_entities FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.data_ingestion_runs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.data_ingestion_errors FROM PUBLIC, anon, authenticated;

COMMIT;
