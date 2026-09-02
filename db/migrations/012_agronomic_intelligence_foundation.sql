BEGIN;

-- Fundação da inteligência agronômica por cultura.
-- Nenhuma faixa técnica é inventada aqui: os perfis de cultura nascem em DRAFT,
-- sem faixas de suficiência, aguardando homologação de um agrônomo responsável.

CREATE TYPE crop_profile_status AS ENUM ('DRAFT','ACTIVE','SUPERSEDED');
CREATE TYPE lab_parameter_category AS ENUM ('QUIMICO','FISICO','MICROBIOLOGICO');
CREATE TYPE parameter_criticality AS ENUM ('BAIXA','MEDIA','ALTA');

CREATE TABLE technical_regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Catálogo de culturas, versionado. Reaproveita o mesmo padrão de rule_sets
-- (code + semantic_version + content_hash + trilha de autor/revisor/aprovador),
-- mas normalizado por parâmetro em crop_profile_parameters, para permitir CRUD
-- administrativo campo a campo em vez de editar um jsonb solto.
CREATE TABLE crop_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  semantic_version text NOT NULL DEFAULT '0.1.0',
  content_hash text,
  status crop_profile_status NOT NULL DEFAULT 'DRAFT',
  applicable_regions text[] NOT NULL DEFAULT '{}',
  applicable_systems text[] NOT NULL DEFAULT '{}',
  technical_notes text,
  authored_by uuid REFERENCES users(id),
  reviewed_by uuid[] NOT NULL DEFAULT '{}',
  approved_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (code, semantic_version)
);

-- Um parâmetro dentro de um perfil de cultura. sufficiency_ranges/criticality/
-- recommendation_rules ficam NULL até homologação técnica -- é o estado
-- "aguardando homologação", nunca um valor aproximado.
CREATE TABLE crop_profile_parameters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crop_profile_id uuid NOT NULL REFERENCES crop_profiles(id) ON DELETE CASCADE,
  parameter_code text NOT NULL,
  parameter_category lab_parameter_category NOT NULL DEFAULT 'QUIMICO',
  depth_from_cm numeric(6,2),
  depth_to_cm numeric(6,2),
  analytical_method_allowed text[] NOT NULL DEFAULT '{}',
  unit_expected text,
  sufficiency_ranges jsonb,
  criticality parameter_criticality,
  yield_goal_bracket jsonb,
  technical_notes text,
  recommendation_rules jsonb,
  status crop_profile_status NOT NULL DEFAULT 'DRAFT',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (crop_profile_id, parameter_code, depth_from_cm, depth_to_cm)
);

-- Safras e Culturas: liga a safra a um perfil de cultura cadastrado (não mais
-- só texto livre) e adiciona os atributos agronômicos objetivos pedidos.
ALTER TABLE crop_seasons
  ADD COLUMN crop_profile_id uuid REFERENCES crop_profiles(id),
  ADD COLUMN cultivar text,
  ADD COLUMN management_system text,
  ADD COLUMN soil_type text,
  ADD COLUMN soil_texture text,
  ADD COLUMN technical_region_code text REFERENCES technical_regions(code);

-- Categoria do resultado laboratorial. Todos os parâmetros hoje reconhecidos
-- pelo importador (pH, P, K, Ca, Mg, Al, CTC, V%, MO, S, B, Zn, Cu, Mn, Fe) são
-- químicos -- por isso o default e o backfill abaixo são seguros e não são uma
-- suposição: é a realidade de tudo que já foi importado até hoje.
ALTER TABLE lab_results
  ADD COLUMN parameter_category lab_parameter_category NOT NULL DEFAULT 'QUIMICO';

-- Motor determinístico: a interpretação passa a poder se apoiar diretamente no
-- perfil de cultura (crop_profile_id), sem depender de um rule_set genérico
-- ainda não homologado. rule_set_id continua existindo para uma futura camada
-- de regras regionais mais amplas, mas deixa de ser obrigatório.
ALTER TABLE interpretations
  ALTER COLUMN rule_set_id DROP NOT NULL,
  ADD COLUMN crop_profile_id uuid REFERENCES crop_profiles(id),
  ADD COLUMN not_interpretable_reason text;

ALTER TABLE interpretations
  ADD CONSTRAINT interpretations_basis_required
  CHECK (rule_set_id IS NOT NULL OR crop_profile_id IS NOT NULL OR not_interpretable_reason IS NOT NULL);

-- Rastreabilidade ponta a ponta: um lab_sample nasce sempre vinculado a um
-- ponto de coleta real. Antes desta migration a coluna era opcional; a partir
-- de agora toda amostra promovida do laudo precisa apontar para um
-- sample_point existente (ver correção do fluxo de importação).
CREATE INDEX lab_samples_sample_point_idx ON lab_samples (sample_point_id);

-- Catálogo inicial de culturas -- somente identificação, sem nenhuma faixa
-- técnica. Cada perfil nasce DRAFT e aguardando homologação de um agrônomo
-- responsável antes de ser usado por qualquer interpretação real.
INSERT INTO crop_profiles (code, name, status, technical_notes) VALUES
  ('SOJA', 'Soja', 'DRAFT', 'Catálogo de cultura criado automaticamente. Faixas de suficiência aguardando homologação técnica.'),
  ('MILHO', 'Milho', 'DRAFT', 'Catálogo de cultura criado automaticamente. Faixas de suficiência aguardando homologação técnica.'),
  ('TRIGO', 'Trigo', 'DRAFT', 'Catálogo de cultura criado automaticamente. Faixas de suficiência aguardando homologação técnica.'),
  ('CEVADA', 'Cevada', 'DRAFT', 'Catálogo de cultura criado automaticamente. Faixas de suficiência aguardando homologação técnica.'),
  ('ARROZ', 'Arroz', 'DRAFT', 'Catálogo de cultura criado automaticamente. Faixas de suficiência aguardando homologação técnica.')
ON CONFLICT (code, semantic_version) DO NOTHING;

COMMIT;
