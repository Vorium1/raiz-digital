BEGIN;

-- Compatibilidade para ambientes candidatos que tenham executado uma versão anterior da
-- migration 038, na qual existia unicidade por decisão. O contrato final preserva múltiplas
-- revisões imutáveis da MESMA decisão quando chega evidência NDVI nova; a deduplicação continua
-- no publisher, que só republica quando a evidência foi criada/arquivada depois da última publicação.
DROP INDEX IF EXISTS reports_decision_unique_idx;

CREATE INDEX IF NOT EXISTS reports_decision_lookup_idx
  ON reports (tenant_id, interpretation_id, prescription_generation_id, published_at DESC)
  WHERE prescription_generation_id IS NOT NULL;

COMMIT;
