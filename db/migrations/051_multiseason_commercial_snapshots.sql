BEGIN;

ALTER TABLE planning_scenario_crops
  ADD CONSTRAINT planning_scenario_crops_tenant_scenario_id_unique
  UNIQUE (tenant_id, scenario_id, id);

CREATE TABLE planning_crop_commercial_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  scenario_id uuid NOT NULL,
  planning_crop_id uuid NOT NULL,
  label text CHECK (label IS NULL OR char_length(label) BETWEEN 1 AND 160),
  simulation_mode text NOT NULL CHECK (simulation_mode IN ('SINGLE','PK_PAIR','LIME')),
  schema_version integer NOT NULL DEFAULT 1 CHECK (schema_version = 1),
  area_ha numeric(14,4) NOT NULL CHECK (area_ha > 0),
  crop_position integer NOT NULL CHECK (crop_position >= 0),
  crop_code text NOT NULL,
  season_label text NOT NULL DEFAULT '',
  planned_date date NULL,
  source_scenario_updated_at timestamptz NOT NULL,
  source_crop_updated_at timestamptz NOT NULL,
  source_targets jsonb NOT NULL CHECK (jsonb_typeof(source_targets) = 'array'),
  product_snapshots jsonb NOT NULL CHECK (jsonb_typeof(product_snapshots) = 'array'),
  engine_input jsonb NOT NULL CHECK (jsonb_typeof(engine_input) = 'object'),
  engine_output jsonb NOT NULL CHECK (jsonb_typeof(engine_output) = 'object'),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, scenario_id)
    REFERENCES planning_scenarios(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, scenario_id, planning_crop_id)
    REFERENCES planning_scenario_crops(tenant_id, scenario_id, id) ON DELETE CASCADE
);

CREATE INDEX planning_crop_commercial_snapshots_crop_created_idx
  ON planning_crop_commercial_snapshots
  (tenant_id, scenario_id, planning_crop_id, created_at DESC);

ALTER TABLE planning_crop_commercial_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE planning_crop_commercial_snapshots FORCE ROW LEVEL SECURITY;
CREATE POLICY planning_crop_commercial_snapshots_tenant_policy
  ON planning_crop_commercial_snapshots
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Histórico comercial do planejamento: criar/consultar, nunca reescrever ou apagar.
GRANT SELECT, INSERT ON planning_crop_commercial_snapshots TO raiz_app;
REVOKE UPDATE, DELETE ON planning_crop_commercial_snapshots FROM raiz_app;

CREATE OR REPLACE FUNCTION protect_planning_crop_commercial_snapshot()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Planning crop commercial snapshot is immutable'
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS planning_crop_commercial_snapshots_immutable
  ON planning_crop_commercial_snapshots;
CREATE TRIGGER planning_crop_commercial_snapshots_immutable
  BEFORE UPDATE OR DELETE ON planning_crop_commercial_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION protect_planning_crop_commercial_snapshot();

COMMENT ON TABLE planning_crop_commercial_snapshots IS
  'Snapshot imutável de uma escolha comercial por cultivo do Planejamento Plurissafras. Congela o alvo técnico corrente, produto, composição/PRNT/preço e resultado sem alterar a necessidade agronômica.';
COMMENT ON COLUMN planning_crop_commercial_snapshots.source_targets IS
  'Alvos determinísticos do cultivo no instante do salvamento. Nunca substituem a recomendação agronômica nem autorizam dose ausente.';
COMMENT ON COLUMN planning_crop_commercial_snapshots.product_snapshots IS
  'Cópia dos produtos selecionados no instante da simulação; edição posterior do catálogo não reescreve o histórico.';

COMMIT;
