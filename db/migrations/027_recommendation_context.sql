-- Contexto agronômico explícito para recomendação de dose.
--
-- IMPORTANTE: `cultivation_order_after_soil_analysis` NÃO é a mesma coisa que
-- `cultivation_years`. O primeiro representa a posição da cultura em relação
-- à análise de solo usada na recomendação (1º, 2º, ... cultivo após a análise);
-- o segundo continua sendo apenas o histórico de anos de cultivo da área.
-- A separação impede o motor de dose P/K de inferir uma dimensão que a CQFS
-- trata explicitamente nas tabelas de adubação.

ALTER TABLE crop_seasons
  ADD COLUMN IF NOT EXISTS cultivation_order_after_soil_analysis integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'crop_seasons_cultivation_order_after_soil_analysis_check'
  ) THEN
    ALTER TABLE crop_seasons
      ADD CONSTRAINT crop_seasons_cultivation_order_after_soil_analysis_check
      CHECK (
        cultivation_order_after_soil_analysis IS NULL
        OR cultivation_order_after_soil_analysis >= 1
      ) NOT VALID;
  END IF;
END $$;

ALTER TABLE crop_seasons
  VALIDATE CONSTRAINT crop_seasons_cultivation_order_after_soil_analysis_check;

COMMENT ON COLUMN crop_seasons.cultivation_order_after_soil_analysis IS
  'Ordem do cultivo em relação à análise de solo que sustenta a recomendação (1=primeiro, 2=segundo, ...). Não confundir com cultivation_years. O motor CQFS P/K atual suporta somente 1 e 2; ordens maiores permanecem bloqueadas até regra técnica homologada.';
