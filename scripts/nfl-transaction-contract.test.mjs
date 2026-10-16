import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const sql = readFileSync(new URL('../supabase/migrations/20261016040000_p03a_transactional_ingestion.sql', import.meta.url), 'utf8');
test('restricted executor', () => {
  assert.match(sql, /SECURITY INVOKER/);
  assert.match(sql, /REVOKE ALL ON FUNCTION .* FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION .* TO service_role/);
});
test('single transaction, data integrity, audit record', () => {
  assert.match(sql, /BEGIN;/);
  assert.match(sql, /COMMIT;/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /INSERT INTO public\.teams/);
  assert.match(sql, /INSERT INTO public\.games/);
  assert.match(sql, /INSERT INTO public\.data_provider_entities/);
  assert.match(sql, /INSERT INTO public\.data_ingestion_runs/);
});
test('no unverified scores or final-state promotion', () => {
  assert.match(sql, /'unverified', NULL, NULL/);
  assert.doesNotMatch(sql, /UPDATE public\.games/);
});
