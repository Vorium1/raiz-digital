BEGIN;

-- Política opt-in por empresa. DEFAULT false evita bloquear retroativamente clientes históricos antes de
-- existir confirmação formal da fonte; o piloto pode ativar a exigência depois de verificar seus laudos.
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS require_source_human_verification boolean NOT NULL DEFAULT false;

-- A análise já carregava `source_file_key`, mas isso não identifica com segurança QUAL import gerou cada
-- conjunto de linhas quando há mais de um arquivo. Daqui em diante cada import mantém sua própria chave
-- imutável de arquivo bruto. Não há backfill por inferência para arquivos históricos.
ALTER TABLE analysis_imports
  ADD COLUMN IF NOT EXISTS raw_object_key text;

-- Permite que a confirmação referencie atomicamente o par import + análise dentro do mesmo tenant.
-- O `id` do import já é único, mas a chave composta impede por integridade relacional que uma confirmação
-- associe acidentalmente um import de uma análise a outra análise do mesmo tenant.
ALTER TABLE analysis_imports
  ADD CONSTRAINT analysis_imports_tenant_import_analysis_unique
  UNIQUE (tenant_id, id, analysis_id);

CREATE TABLE analysis_source_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  analysis_id uuid NOT NULL,
  import_id uuid NOT NULL,
  file_sha256 text NOT NULL CHECK (file_sha256 ~ '^[a-fA-F0-9]{64}$'),
  raw_object_key text NOT NULL,
  verified_by uuid NOT NULL REFERENCES users(id),
  verified_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, analysis_id) REFERENCES analyses(tenant_id, id),
  FOREIGN KEY (tenant_id, import_id, analysis_id)
    REFERENCES analysis_imports(tenant_id, id, analysis_id),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, import_id, file_sha256, raw_object_key)
);

CREATE INDEX analysis_source_verifications_analysis_idx
  ON analysis_source_verifications (tenant_id, analysis_id, verified_at DESC);

ALTER TABLE analysis_source_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_source_verifications FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON analysis_source_verifications
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());
GRANT SELECT, INSERT ON analysis_source_verifications TO raiz_app;

COMMENT ON TABLE analysis_source_verifications IS
  'Confirmações humanas auditáveis do arquivo bruto que originou um import. Uma confirmação só vale para o mesmo import + análise + SHA-256 + chave de objeto; nenhuma linha histórica é marcada por inferência.';

COMMIT;
