BEGIN;

CREATE TABLE planning_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  field_id uuid NOT NULL,
  base_analysis_id uuid NULL,
  name text NOT NULL CHECK (length(trim(name)) > 0),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','CALCULATED','REANALYSIS_REQUIRED')),
  irrigated boolean NULL,
  notes text NOT NULL DEFAULT '',
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, field_id) REFERENCES fields(tenant_id, id),
  FOREIGN KEY (tenant_id, base_analysis_id) REFERENCES analyses(tenant_id, id)
);
CREATE INDEX planning_scenarios_tenant_field_updated_idx ON planning_scenarios (tenant_id, field_id, updated_at DESC);

CREATE TABLE planning_scenario_crops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  scenario_id uuid NOT NULL,
  position integer NOT NULL CHECK (position >= 0),
  crop_code text NOT NULL,
  season_label text NOT NULL DEFAULT '',
  planned_date date NULL,
  target_yield numeric NULL CHECK (target_yield IS NULL OR target_yield > 0),
  target_unit text NULL,
  irrigated boolean NULL,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, scenario_id, position),
  FOREIGN KEY (tenant_id, scenario_id) REFERENCES planning_scenarios(tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX planning_scenario_crops_tenant_scenario_position_idx ON planning_scenario_crops (tenant_id, scenario_id, position);

CREATE TABLE planning_scenario_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  scenario_id uuid NOT NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, scenario_id) REFERENCES planning_scenarios(tenant_id, id) ON DELETE CASCADE
);

ALTER TABLE planning_scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE planning_scenarios FORCE ROW LEVEL SECURITY;
ALTER TABLE planning_scenario_crops ENABLE ROW LEVEL SECURITY;
ALTER TABLE planning_scenario_crops FORCE ROW LEVEL SECURITY;
ALTER TABLE planning_scenario_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE planning_scenario_snapshots FORCE ROW LEVEL SECURITY;
CREATE POLICY planning_scenarios_tenant_policy ON planning_scenarios USING (tenant_id = current_setting('app.tenant_id', true)::uuid) WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY planning_scenario_crops_tenant_policy ON planning_scenario_crops USING (tenant_id = current_setting('app.tenant_id', true)::uuid) WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY planning_scenario_snapshots_tenant_policy ON planning_scenario_snapshots USING (tenant_id = current_setting('app.tenant_id', true)::uuid) WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON planning_scenarios, planning_scenario_crops TO raiz_app;
GRANT SELECT, INSERT ON planning_scenario_snapshots TO raiz_app;
REVOKE UPDATE, DELETE ON planning_scenario_snapshots FROM raiz_app;

CREATE OR REPLACE FUNCTION protect_planning_scenario_snapshot()
RETURNS trigger
LANGUAGE plpgsql
AS $
BEGIN
  RAISE EXCEPTION 'Planning scenario snapshot is immutable'
    USING ERRCODE = '55000';
END;
$;

DROP TRIGGER IF EXISTS planning_scenario_snapshots_immutable ON planning_scenario_snapshots;
CREATE TRIGGER planning_scenario_snapshots_immutable
  BEFORE UPDATE OR DELETE ON planning_scenario_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION protect_planning_scenario_snapshot();
COMMIT;
