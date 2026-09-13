BEGIN;

-- Uma reentrega/repetição da aprovação da MESMA geração de IA não pode duplicar a mesma recomendação
-- oficial. Antes deste gate, dois POSTs concorrentes de APPROVED podiam passar pela rota ao mesmo tempo
-- e inserir linhas idênticas em input_recommendations. Primeiro removemos somente duplicatas EXATAS já
-- existentes da mesma geração (mesmo analysis/input/quantidade/unidade/source), preservando a linha mais
-- antiga; depois o índice garante a invariável também sob concorrência.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY tenant_id, analysis_id, calculation_source, input_type, quantity, unit
           ORDER BY calculated_at ASC, id ASC
         ) AS rn
  FROM input_recommendations
  WHERE calculation_source LIKE 'ai_generations:%'
)
DELETE FROM input_recommendations ir
USING ranked r
WHERE ir.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS input_recommendations_ai_generation_exact_unique
ON input_recommendations (tenant_id, analysis_id, calculation_source, input_type, quantity, unit)
WHERE calculation_source LIKE 'ai_generations:%';

COMMIT;
