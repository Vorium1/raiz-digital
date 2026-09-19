BEGIN;

-- Permite nova publicação da MESMA decisão quando chega evidência NDVI nova,
-- sem sobrescrever snapshots anteriores. A deduplicação continua no publisher,
-- que só republica quando a evidência NDVI foi criada/arquivada depois da última publicação.
DROP INDEX IF EXISTS reports_decision_unique_idx;

CREATE INDEX IF NOT EXISTS reports_decision_lookup_idx
  ON reports (tenant_id, interpretation_id, prescription_generation_id, published_at DESC)
  WHERE prescription_generation_id IS NOT NULL;

COMMIT;
