BEGIN;

-- Uma recomendação promovida por IA precisa apontar estruturalmente para a geração que a originou.
-- `calculation_source = 'ai_generations:<uuid>'` continua sendo mantido por compatibilidade/auditoria,
-- mas texto livre não é suficiente para decidir se a recomendação ainda é corrente depois que a safra
-- ou a interpretação determinística mudam.
ALTER TABLE input_recommendations
  ADD COLUMN IF NOT EXISTS source_generation_id uuid;

-- Backfill conservador: só vincula linhas cujo calculation_source tenha o formato exato esperado E cuja
-- geração exista no mesmo tenant. Linhas legadas/externas ficam nulas em vez de receber vínculo inventado.
UPDATE input_recommendations ir
SET source_generation_id = g.id
FROM ai_generations g
WHERE ir.source_generation_id IS NULL
  AND ir.tenant_id = g.tenant_id
  AND ir.calculation_source ~* '^ai_generations:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  AND split_part(ir.calculation_source, ':', 2)::uuid = g.id
  AND g.kind = 'AGRONOMIC_PRESCRIPTION';

ALTER TABLE input_recommendations
  ADD CONSTRAINT input_recommendations_source_generation_fk
  FOREIGN KEY (tenant_id, source_generation_id)
  REFERENCES ai_generations(tenant_id, id);

CREATE INDEX IF NOT EXISTS input_recommendations_source_generation_idx
  ON input_recommendations (tenant_id, source_generation_id)
  WHERE source_generation_id IS NOT NULL;

COMMENT ON COLUMN input_recommendations.source_generation_id IS
  'Geração de prescrição de IA que originou a recomendação oficial. NULL apenas para recomendações não-IA/legadas sem vínculo comprovável.';

COMMIT;
