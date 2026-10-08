BEGIN;

CREATE TABLE planning_crop_agroclimate_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  scenario_id uuid NOT NULL,
  planning_crop_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider = 'EMBRAPA_AGRITEC_V2'),
  provider_version text NOT NULL DEFAULT 'v2' CHECK (provider_version = 'v2'),
  source_urls jsonb NOT NULL CHECK (jsonb_typeof(source_urls) = 'array'),
  retrieved_at timestamptz NOT NULL,
  municipality_name text NOT NULL,
  state_code char(2) NOT NULL,
  ibge_municipality_code text NOT NULL CHECK (ibge_municipality_code ~ '^[0-9]{7}$'),
  crop_code text NOT NULL,
  agritec_culture_id integer NOT NULL CHECK (agritec_culture_id > 0),
  planned_date date NOT NULL,
  assessment jsonb NOT NULL CHECK (jsonb_typeof(assessment) = 'object'),
  source_windows jsonb NOT NULL CHECK (jsonb_typeof(source_windows) = 'array'),
  source_scenario_updated_at timestamptz NOT NULL,
  source_crop_updated_at timestamptz NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, scenario_id)
    REFERENCES planning_scenarios(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, scenario_id, planning_crop_id)
    REFERENCES planning_scenario_crops(tenant_id, scenario_id, id) ON DELETE CASCADE
);

CREATE INDEX planning_crop_agroclimate_snapshots_crop_created_idx
  ON planning_crop_agroclimate_snapshots
  (tenant_id, scenario_id, planning_crop_id, created_at DESC);

ALTER TABLE planning_crop_agroclimate_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE planning_crop_agroclimate_snapshots FORCE ROW LEVEL SECURITY;

CREATE POLICY planning_crop_agroclimate_snapshots_tenant_policy
  ON planning_crop_agroclimate_snapshots
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

GRANT SELECT, INSERT ON planning_crop_agroclimate_snapshots TO raiz_app;
REVOKE UPDATE, DELETE ON planning_crop_agroclimate_snapshots FROM raiz_app;

CREATE OR REPLACE FUNCTION protect_planning_crop_agroclimate_snapshot()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Planning crop agroclimate snapshot is immutable'
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS planning_crop_agroclimate_snapshots_immutable
  ON planning_crop_agroclimate_snapshots;
CREATE TRIGGER planning_crop_agroclimate_snapshots_immutable
  BEFORE UPDATE OR DELETE ON planning_crop_agroclimate_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION protect_planning_crop_agroclimate_snapshot();

COMMENT ON TABLE planning_crop_agroclimate_snapshots IS
  'Evidência agroclimática oficial e imutável por cultivo do Planejamento Plurissafras. ZARC é risco de implantação, não previsão de produtividade nem gatilho automático de dose.';
COMMENT ON COLUMN planning_crop_agroclimate_snapshots.assessment IS
  'Envelope ZARC para a data planejada. Pode permanecer variável por solo/ciclo; nenhuma dimensão ausente é escolhida automaticamente.';
COMMENT ON COLUMN planning_crop_agroclimate_snapshots.source_windows IS
  'Janelas oficiais Agritec usadas no envelope, congeladas sem token/segredo.';

COMMIT;
