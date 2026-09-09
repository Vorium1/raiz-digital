-- Descoberto na prática (2026-09-04): ao carregar as faixas reais de P
-- (por classe de argila) e K (por classe de CTC) da CQFS-RS/SC, a
-- constraint UNIQUE (crop_profile_id, parameter_code, depth_from_cm,
-- depth_to_cm) impedia guardar as 4 faixas de cada -- a segunda linha
-- sobrescrevia a primeira silenciosamente (mesmo parametro/profundidade,
-- constraint batia, ON CONFLICT fazia UPDATE em vez de INSERT). Isso não é
-- caso raro: é como a ciência do solo brasileira trabalha -- P e K quase
-- sempre têm faixa condicionada a outro parâmetro do mesmo solo (argila,
-- CTC). O motor (`src/domain/agronomic-engine.ts`) e o motor determinístico
-- previamente também não sabiam escolher entre múltiplas faixas -- pegavam
-- sempre a primeira, silenciosamente errado para as outras classes.
--
-- Adiciona uma condição opcional: "esta faixa só vale quando o parâmetro X
-- (medido na mesma amostra) está entre condition_min e condition_max".
-- NULL nos três campos = sem condição (comportamento anterior, não muda
-- nada para os parâmetros que já existiam). O motor foi atualizado junto
-- (mesmo commit) para escolher a faixa certa usando essa condição.

ALTER TABLE crop_profile_parameters
  ADD COLUMN condition_parameter_code text,
  ADD COLUMN condition_min numeric(12,4),
  ADD COLUMN condition_max numeric(12,4);

ALTER TABLE crop_profile_parameters
  DROP CONSTRAINT crop_profile_parameters_crop_profile_id_parameter_code_dept_key;

ALTER TABLE crop_profile_parameters
  ADD CONSTRAINT crop_profile_parameters_unique_range
  UNIQUE (crop_profile_id, parameter_code, depth_from_cm, depth_to_cm, condition_parameter_code, condition_min, condition_max);
