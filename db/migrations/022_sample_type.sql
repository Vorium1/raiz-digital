-- Tipo de amostra como dimensão de primeira classe -- decisão do diretor
-- (2026-09-04): a RAIZ precisa separar classificação/cálculo por tipo de
-- amostra (solo, foliar, pecíolo, massa seca, grão, semente, fertilizante,
-- biológico), não assumir implicitamente que toda amostra é solo. Motivado
-- pelo carregamento de culturas frutíferas/perenes (videira, macieira,
-- citros...), que usam diagnose foliar (folha ou pecíolo) como método
-- PRINCIPAL de avaliação nutricional -- uma faixa de suficiência de folha e
-- uma de solo pro mesmo código de parâmetro (ex.: "N") nunca podem ser
-- confundidas pelo motor.
--
-- DEFAULT 'SOLO' em ambas as tabelas preserva 100% do comportamento
-- existente (todo dado já carregado até hoje é de solo) -- esta migration
-- não muda nenhuma classificação já homologada ou em rascunho, só abre
-- espaço pra registrar tipos novos.

ALTER TABLE crop_profile_parameters
  ADD COLUMN sample_type text NOT NULL DEFAULT 'SOLO'
  CHECK (sample_type IN ('SOLO','FOLIAR','PECIOLO','MASSA_SECA','GRAO','SEMENTE','FERTILIZANTE','BIOLOGICO'));

ALTER TABLE lab_samples
  ADD COLUMN sample_type text NOT NULL DEFAULT 'SOLO'
  CHECK (sample_type IN ('SOLO','FOLIAR','PECIOLO','MASSA_SECA','GRAO','SEMENTE','FERTILIZANTE','BIOLOGICO'));

-- A constraint de unicidade de crop_profile_parameters (migration 020) não
-- inclui sample_type -- sem isso, uma faixa FOLIAR e uma PECIOLO do mesmo
-- parâmetro/cultura (ambas sem profundidade nem condição, depth_from_cm/
-- depth_to_cm/condition_* todos NULL) colidiriam na constraint e a segunda
-- sobrescreveria a primeira silenciosamente -- o mesmo bug já corrigido uma
-- vez na migration 020, agora numa dimensão nova.
ALTER TABLE crop_profile_parameters
  DROP CONSTRAINT crop_profile_parameters_unique_range;

ALTER TABLE crop_profile_parameters
  ADD CONSTRAINT crop_profile_parameters_unique_range
  UNIQUE (crop_profile_id, parameter_code, sample_type, depth_from_cm, depth_to_cm, condition_parameter_code, condition_min, condition_max);
