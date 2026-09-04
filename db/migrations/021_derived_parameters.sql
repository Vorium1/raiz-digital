-- Suporte a "parâmetro derivado": um valor a ser classificado que não vem
-- direto de um resultado de laboratório, mas de uma fórmula real e citável
-- aplicada sobre outros parâmetros da mesma amostra (ex.: risco de toxidez
-- de ferro em arroz irrigado, calculado a partir de Fe + CTC -- Manual
-- CQFS-RS/SC 2016). A fórmula em si NUNCA fica em texto/dado editável --
-- fica registrada em código (src/domain/agronomic-engine.ts,
-- DERIVED_PARAMETER_FUNCTIONS), versionada e revisada como qualquer outra
-- regra do motor. Esta coluna só guarda o NOME da função registrada.

ALTER TABLE crop_profile_parameters
  ADD COLUMN derived_parameter_code text;
