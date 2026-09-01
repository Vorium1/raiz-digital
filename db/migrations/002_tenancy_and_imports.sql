BEGIN;

CREATE SCHEMA IF NOT EXISTS app;

CREATE OR REPLACE FUNCTION app.current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tenants_touch_updated_at ON tenants;
CREATE TRIGGER tenants_touch_updated_at BEFORE UPDATE ON tenants
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

DROP TRIGGER IF EXISTS clients_touch_updated_at ON clients;
CREATE TRIGGER clients_touch_updated_at BEFORE UPDATE ON clients
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

DROP TRIGGER IF EXISTS analyses_touch_updated_at ON analyses;
CREATE TRIGGER analyses_touch_updated_at BEFORE UPDATE ON analyses
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE TYPE import_status AS ENUM ('UPLOADED','PARSING','VALIDATED','INCONSISTENT','COMMITTED','FAILED');

CREATE TABLE analysis_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  analysis_id uuid REFERENCES analyses(id),
  file_name text NOT NULL,
  file_sha256 text NOT NULL,
  source_format text NOT NULL CHECK (source_format IN ('CSV_LONG','CSV_WIDE','XLSX','PDF_OCR')),
  status import_status NOT NULL DEFAULT 'UPLOADED',
  detected_headers jsonb NOT NULL DEFAULT '[]'::jsonb,
  mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  normalized_row_count integer NOT NULL DEFAULT 0 CHECK (normalized_row_count >= 0),
  blocker_count integer NOT NULL DEFAULT 0 CHECK (blocker_count >= 0),
  warning_count integer NOT NULL DEFAULT 0 CHECK (warning_count >= 0),
  confidence_score numeric(5,2),
  validation_issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  committed_at timestamptz,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, file_sha256, analysis_id)
);

CREATE TABLE analysis_import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  import_id uuid NOT NULL,
  source_line integer NOT NULL CHECK (source_line > 0),
  sample_code text NOT NULL,
  parameter_code text NOT NULL,
  numeric_value numeric(18,6) NOT NULL,
  unit text NOT NULL,
  analytical_method text NOT NULL,
  unit_inferred boolean NOT NULL DEFAULT false,
  method_inferred boolean NOT NULL DEFAULT false,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, import_id) REFERENCES analysis_imports(tenant_id, id) ON DELETE CASCADE,
  UNIQUE (tenant_id, import_id, sample_code, parameter_code, analytical_method)
);

CREATE INDEX analysis_imports_tenant_status_idx ON analysis_imports(tenant_id, status, created_at DESC);
CREATE INDEX analysis_import_rows_import_idx ON analysis_import_rows(tenant_id, import_id);

ALTER TABLE tenant_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE crop_seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE sample_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE interpretations ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_import_rows ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'tenant_members','clients','properties','fields','crop_seasons','collection_orders',
    'sample_points','analyses','lab_samples','lab_results','interpretations','reports',
    'subscriptions','invoices','analysis_imports','analysis_import_rows'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = app.current_tenant_id()) WITH CHECK (tenant_id = app.current_tenant_id())',
      table_name
    );
  END LOOP;
END $$;

COMMIT;
