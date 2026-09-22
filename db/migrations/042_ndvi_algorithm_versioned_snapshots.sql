BEGIN;

-- Preserva snapshots NDVI arquivados como evidência imutável e permite uma nova versão
-- do algoritmo para a mesma aquisição/data sem UPDATE/DELETE da evidência anterior.
--
-- A migration 037 tornou qualquer linha com raster_object_key imutável no PostgreSQL.
-- Portanto, correções de algoritmo devem nascer como NOVA linha, identificada por
-- raster_algorithm, e nunca sobrescrever V1.

ALTER TABLE field_ndvi_snapshots
  DROP CONSTRAINT IF EXISTS field_ndvi_snapshots_tenant_id_field_id_captured_at_source_key;

ALTER TABLE field_ndvi_snapshots
  DROP CONSTRAINT IF EXISTS field_ndvi_snapshots_version_unique;

ALTER TABLE field_ndvi_snapshots
  ADD CONSTRAINT field_ndvi_snapshots_version_unique
  UNIQUE NULLS NOT DISTINCT (tenant_id, field_id, captured_at, source, raster_algorithm);

CREATE INDEX IF NOT EXISTS field_ndvi_snapshots_current_algorithm_idx
  ON field_ndvi_snapshots (tenant_id, field_id, raster_algorithm, captured_at DESC, created_at DESC);

COMMIT;
