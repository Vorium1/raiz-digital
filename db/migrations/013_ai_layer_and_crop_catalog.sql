BEGIN;

-- Camada de IA: geracoes auditaveis (nunca sobrescritas) + fluxo de revisao
-- profissional. Cada linha e imutavel no conteudo gerado; so o estado de
-- revisao muda na mesma linha. Uma nova geracao apos "solicitar ajuste"
-- aponta para a anterior via superseded_by, preservando a cadeia completa.
CREATE TYPE ai_generation_kind AS ENUM ('AGRONOMIC_NARRATIVE', 'OPERATIONAL_ASSISTANT');
CREATE TYPE ai_review_status AS ENUM ('PENDING_REVIEW', 'APPROVED', 'CHANGES_REQUESTED', 'REJECTED');

CREATE TABLE ai_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  kind ai_generation_kind NOT NULL,
  interpretation_id uuid REFERENCES interpretations(id),
  analysis_id uuid REFERENCES analyses(id),
  provider text NOT NULL,
  model text NOT NULL,
  prompt_version text NOT NULL,
  request_payload jsonb NOT NULL,
  response_payload jsonb NOT NULL,
  tokens_used integer,
  cost_usd numeric(10,4),
  status ai_review_status NOT NULL DEFAULT 'PENDING_REVIEW',
  reviewer_note text,
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  superseded_by uuid REFERENCES ai_generations(id),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);

CREATE INDEX ai_generations_analysis_idx ON ai_generations (tenant_id, analysis_id, created_at DESC);
CREATE INDEX ai_generations_kind_idx ON ai_generations (tenant_id, kind, created_at DESC);

ALTER TABLE ai_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_generations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ai_generations USING (tenant_id = app.current_tenant_id()) WITH CHECK (tenant_id = app.current_tenant_id());

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO raiz_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ai_generations TO raiz_app;

-- Base de conhecimento agronomico: fontes tecnicas homologaveis. So uma
-- fonte com status = 'ACTIVE' pode ser citada pela IA como referencia
-- tecnica. Estrutura pensada para uma futura camada de busca semantica
-- (RAG) sem comprometer o controle de homologacao: o campo `content`
-- guarda o texto/trecho fonte; `embedding_ref` fica reservado (nulo hoje)
-- para um indice vetorial futuro, sem forcar essa decisao agora.
CREATE TABLE technical_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  institution text,
  edition_year integer,
  crop_profile_id uuid REFERENCES crop_profiles(id),
  region_code text,
  analytical_method text,
  subject text,
  semantic_version text NOT NULL DEFAULT '0.1.0',
  valid_from date,
  valid_until date,
  status crop_profile_status NOT NULL DEFAULT 'DRAFT',
  content text,
  embedding_ref text,
  authored_by uuid REFERENCES users(id),
  approved_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Culturas: a RAIZ nao foi pensada so para soja. crop_group e puramente
-- organizacional (agrupar verao/inverno na tela) -- o motor determinístico
-- nunca le esta coluna, resolve sempre por crop_profile_id + parametro +
-- profundidade + metodo, igual para qualquer cultura.
ALTER TABLE crop_profiles ADD COLUMN crop_group text;

UPDATE crop_profiles SET crop_group = 'VERAO' WHERE code IN ('SOJA', 'MILHO', 'ARROZ');
UPDATE crop_profiles SET crop_group = 'INVERNO' WHERE code IN ('TRIGO', 'CEVADA');

INSERT INTO crop_profiles (code, name, status, crop_group, technical_notes) VALUES
  ('AVEIA', 'Aveia', 'DRAFT', 'INVERNO', 'Catálogo de cultura criado automaticamente. Faixas de suficiência aguardando homologação técnica.'),
  ('TRITICALE', 'Triticale', 'DRAFT', 'INVERNO', 'Catálogo de cultura criado automaticamente. Faixas de suficiência aguardando homologação técnica.'),
  ('CANOLA', 'Canola', 'DRAFT', 'INVERNO', 'Catálogo de cultura criado automaticamente. Faixas de suficiência aguardando homologação técnica.')
ON CONFLICT (code, semantic_version) DO NOTHING;

COMMIT;
