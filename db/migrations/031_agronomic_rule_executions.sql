BEGIN;

-- Ledger de execução das regras determinísticas. A regra/fonte usadas no cálculo
-- ficam congeladas junto dos inputs e outputs; atualizar o catálogo no futuro não
-- reescreve o histórico de uma recomendação já calculada.
CREATE TABLE agronomic_rule_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  analysis_id uuid REFERENCES analyses(id) ON DELETE SET NULL,
  crop_season_id uuid REFERENCES crop_seasons(id) ON DELETE SET NULL,
  rule_id text NOT NULL,
  rule_version text NOT NULL,
  source_snapshot_id text NOT NULL,
  execution_status text NOT NULL CHECK (execution_status IN ('READY_FOR_IMPLEMENTATION','REQUIRES_AGRONOMIST_REVIEW','INSUFFICIENT_EVIDENCE')),
  source_trace jsonb NOT NULL,
  input_payload jsonb NOT NULL,
  output_payload jsonb NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);

CREATE INDEX agronomic_rule_executions_analysis_idx
  ON agronomic_rule_executions (tenant_id, analysis_id, created_at DESC);
CREATE INDEX agronomic_rule_executions_rule_idx
  ON agronomic_rule_executions (tenant_id, rule_id, rule_version, created_at DESC);

ALTER TABLE agronomic_rule_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agronomic_rule_executions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON agronomic_rule_executions
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

-- Ledger append-only no papel de runtime. Correções geram uma nova execução; nunca
-- alteram ou apagam a evidência que sustentou a execução anterior.
GRANT SELECT, INSERT ON agronomic_rule_executions TO raiz_app;
REVOKE UPDATE, DELETE ON agronomic_rule_executions FROM raiz_app;

COMMIT;
