BEGIN;

ALTER TABLE analyses
  ADD COLUMN requested_analysis_depth text,
  ADD COLUMN analysis_context jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE analyses
  ADD CONSTRAINT analyses_requested_analysis_depth_chk
  CHECK (
    requested_analysis_depth IS NULL OR
    requested_analysis_depth IN (
      'interpretacao-rapida',
      'recomendacao-manejo',
      'analise-completa-campo',
      'diagnostico-360',
      'personalizada'
    )
  ),
  ADD CONSTRAINT analyses_analysis_context_object_chk
  CHECK (jsonb_typeof(analysis_context) = 'object');

COMMENT ON COLUMN analyses.requested_analysis_depth IS
  'Profundidade de diagnóstico escolhida pelo usuário. É intenção de análise, não garantia de que todos os dados necessários estão presentes.';
COMMENT ON COLUMN analyses.analysis_context IS
  'Snapshot versionado dos dados/declaracões usados para avaliar a profundidade possível. Dados faltantes continuam explícitos e não são inferidos pela IA.';

COMMIT;
