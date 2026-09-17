BEGIN;

-- A recomendação pode ser regenerada e aprovada sem criar uma nova revisão determinística.
-- Nesse caso, cada publicação precisa preservar um snapshot imutável distinto da decisão vigente.
ALTER TABLE reports
  DROP CONSTRAINT IF EXISTS reports_tenant_id_interpretation_id_revision_key;

CREATE INDEX IF NOT EXISTS reports_interpretation_published_idx
  ON reports (tenant_id, interpretation_id, published_at DESC);

COMMIT;
