BEGIN;

CREATE TABLE commercial_plan_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  analysis_id uuid NOT NULL REFERENCES analyses(id),
  crop_season_id uuid NOT NULL REFERENCES crop_seasons(id),
  label text CHECK (label IS NULL OR char_length(label) BETWEEN 1 AND 160),
  simulation_mode text NOT NULL CHECK (simulation_mode IN ('SINGLE','PK_PAIR','LIME')),
  schema_version integer NOT NULL DEFAULT 1 CHECK (schema_version = 1),
  area_ha numeric(14,4) NOT NULL CHECK (area_ha > 0),
  source_targets jsonb NOT NULL CHECK (jsonb_typeof(source_targets) = 'array'),
  product_snapshots jsonb NOT NULL CHECK (jsonb_typeof(product_snapshots) = 'array'),
  engine_input jsonb NOT NULL CHECK (jsonb_typeof(engine_input) = 'object'),
  engine_output jsonb NOT NULL CHECK (jsonb_typeof(engine_output) = 'object'),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);

CREATE INDEX commercial_plan_snapshots_analysis_created_idx
  ON commercial_plan_snapshots (tenant_id, analysis_id, created_at DESC);

CREATE INDEX commercial_plan_snapshots_season_created_idx
  ON commercial_plan_snapshots (tenant_id, crop_season_id, created_at DESC);

ALTER TABLE commercial_plan_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial_plan_snapshots FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON commercial_plan_snapshots
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

-- Snapshot histórico: o runtime pode consultar e criar, mas nunca reescrever ou apagar.
GRANT SELECT, INSERT ON commercial_plan_snapshots TO raiz_app;
REVOKE UPDATE, DELETE ON commercial_plan_snapshots FROM raiz_app;

COMMENT ON TABLE commercial_plan_snapshots IS
  'Snapshot imutável de uma simulação comercial salva explicitamente. Congela alvos oficiais, produtos/preços/PRNT/limites e resultado do motor sem alterar a recomendação agronômica.';
COMMENT ON COLUMN commercial_plan_snapshots.source_targets IS
  'Referências e valores das recomendações oficiais correntes usados no instante do salvamento.';
COMMENT ON COLUMN commercial_plan_snapshots.product_snapshots IS
  'Cópia dos produtos comerciais selecionados no instante do cálculo; histórico não muda quando o catálogo é editado.';

COMMIT;
