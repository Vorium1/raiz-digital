BEGIN;

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TYPE user_role AS ENUM ('SUPER_ADMIN','TENANT_ADMIN','AGRONOMIST','FIELD_TECH','COMMERCIAL','VIEWER');
CREATE TYPE analysis_status AS ENUM ('DRAFT','COLLECTION_SCHEDULED','COLLECTION_IN_PROGRESS','AWAITING_LAB','IMPORTED','INCONSISTENT','READY_TO_INTERPRET','INTERPRETED','AWAITING_REVIEW','APPROVED','REPORT_SENT','ARCHIVED');
CREATE TYPE subscription_status AS ENUM ('ACTIVE','DUE_SOON','OVERDUE_GRACE','BLOCKED','CANCELED');
CREATE TYPE payment_status AS ENUM ('PENDING','PAID','FAILED','REFUNDED','CANCELED');
CREATE TYPE rule_status AS ENUM ('DRAFT','VALIDATING','ACTIVE','DEPRECATED');

CREATE TABLE tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name text NOT NULL,
  trade_name text NOT NULL,
  tax_id text UNIQUE,
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','BLOCKED','CANCELED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email citext UNIQUE NOT NULL,
  password_hash text,
  two_factor_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

CREATE TABLE tenant_members (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role user_role NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,user_id)
);

CREATE TABLE clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  name text NOT NULL,
  tax_id text,
  email citext,
  phone text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id)
);

CREATE TABLE properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  client_id uuid NOT NULL,
  name text NOT NULL,
  municipality text NOT NULL,
  state char(2) NOT NULL,
  boundary geometry(MultiPolygon,4326),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,client_id) REFERENCES clients(tenant_id,id),
  UNIQUE (tenant_id,id)
);

CREATE TABLE fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  property_id uuid NOT NULL,
  name text NOT NULL,
  area_ha numeric(12,4) NOT NULL CHECK (area_ha > 0),
  boundary geometry(MultiPolygon,4326) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,property_id) REFERENCES properties(tenant_id,id),
  UNIQUE (tenant_id,id)
);

CREATE INDEX fields_boundary_gix ON fields USING gist(boundary);

CREATE TABLE crop_seasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  field_id uuid NOT NULL,
  season_label text NOT NULL,
  current_crop text,
  next_crop text,
  yield_goal numeric(12,3),
  yield_goal_unit text,
  irrigated boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,field_id) REFERENCES fields(tenant_id,id),
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,field_id,season_label)
);

CREATE TABLE collection_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  crop_season_id uuid NOT NULL,
  assigned_to uuid REFERENCES users(id),
  code text NOT NULL,
  grid_area_ha numeric(10,3),
  depth_from_cm numeric(6,2) NOT NULL,
  depth_to_cm numeric(6,2) NOT NULL,
  planned_at timestamptz,
  status text NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED','IN_PROGRESS','DONE','CANCELED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,crop_season_id) REFERENCES crop_seasons(tenant_id,id),
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,code)
);

CREATE TABLE sample_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  collection_order_id uuid NOT NULL,
  code text NOT NULL,
  position geometry(Point,4326) NOT NULL,
  grid_boundary geometry(Polygon,4326),
  collected_at timestamptz,
  collected_by uuid REFERENCES users(id),
  depth_from_cm numeric(6,2) NOT NULL,
  depth_to_cm numeric(6,2) NOT NULL,
  subsample_count integer CHECK (subsample_count > 0),
  gps_source text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,collection_order_id) REFERENCES collection_orders(tenant_id,id),
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,collection_order_id,code)
);

CREATE INDEX sample_points_position_gix ON sample_points USING gist(position);
CREATE INDEX sample_points_grid_gix ON sample_points USING gist(grid_boundary);

CREATE TABLE laboratories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id),
  name text NOT NULL,
  tax_id text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  crop_season_id uuid NOT NULL,
  collection_order_id uuid,
  laboratory_id uuid REFERENCES laboratories(id),
  code text NOT NULL,
  status analysis_status NOT NULL DEFAULT 'DRAFT',
  source_type text CHECK (source_type IN ('INTEGRATION','CSV','XLSX','PDF_OCR','MANUAL')),
  source_file_key text,
  source_human_verified boolean NOT NULL DEFAULT false,
  confidence_score numeric(5,2),
  confidence_level text CHECK (confidence_level IN ('HIGH','ADEQUATE','LIMITED','INSUFFICIENT')),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,crop_season_id) REFERENCES crop_seasons(tenant_id,id),
  FOREIGN KEY (tenant_id,collection_order_id) REFERENCES collection_orders(tenant_id,id),
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,code)
);

CREATE TABLE lab_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  analysis_id uuid NOT NULL,
  sample_point_id uuid,
  laboratory_code text NOT NULL,
  sampled_at date,
  received_at date,
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,analysis_id,laboratory_code),
  FOREIGN KEY (tenant_id,analysis_id) REFERENCES analyses(tenant_id,id),
  FOREIGN KEY (tenant_id,sample_point_id) REFERENCES sample_points(tenant_id,id)
);

CREATE TABLE lab_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  lab_sample_id uuid NOT NULL,
  parameter_code text NOT NULL,
  numeric_value numeric(18,6) NOT NULL,
  unit text NOT NULL,
  analytical_method text NOT NULL,
  detection_limit numeric(18,6),
  source text NOT NULL CHECK (source IN ('MEASURED','CALCULATED')),
  original_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,lab_sample_id) REFERENCES lab_samples(tenant_id,id),
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,lab_sample_id,parameter_code,analytical_method)
);

CREATE TABLE rule_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  semantic_version text NOT NULL,
  content_hash text NOT NULL,
  region_code text NOT NULL,
  supported_crops text[] NOT NULL,
  supported_methods jsonb NOT NULL,
  rules jsonb NOT NULL,
  sources jsonb NOT NULL,
  status rule_status NOT NULL DEFAULT 'DRAFT',
  valid_from date,
  valid_until date,
  authored_by uuid REFERENCES users(id),
  reviewed_by uuid[] NOT NULL DEFAULT '{}',
  approved_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (code,semantic_version),
  UNIQUE (content_hash)
);

CREATE TABLE interpretations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  analysis_id uuid NOT NULL,
  rule_set_id uuid NOT NULL REFERENCES rule_sets(id),
  revision integer NOT NULL DEFAULT 1,
  structured_output jsonb NOT NULL,
  ai_narrative text,
  assumptions jsonb NOT NULL DEFAULT '[]'::jsonb,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL CHECK (status IN ('CALCULATED','AI_GENERATED','IN_REVIEW','APPROVED','PUBLISHED','SUPERSEDED')),
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,analysis_id) REFERENCES analyses(tenant_id,id),
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,analysis_id,revision)
);

CREATE TABLE reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  interpretation_id uuid NOT NULL,
  revision integer NOT NULL,
  storage_key text NOT NULL,
  sha256 text NOT NULL,
  published_at timestamptz NOT NULL,
  published_by uuid NOT NULL REFERENCES users(id),
  FOREIGN KEY (tenant_id,interpretation_id) REFERENCES interpretations(tenant_id,id),
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,interpretation_id,revision)
);

CREATE TABLE subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE REFERENCES tenants(id),
  status subscription_status NOT NULL DEFAULT 'ACTIVE',
  monthly_amount_cents integer NOT NULL CHECK (monthly_amount_cents > 0),
  due_day smallint NOT NULL CHECK (due_day BETWEEN 1 AND 28),
  blocked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE referral_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES subscriptions(id),
  referrer_user_id uuid NOT NULL REFERENCES users(id),
  percentage numeric(5,2) NOT NULL CHECK (percentage > 0 AND percentage <= 100),
  starts_at date NOT NULL,
  ends_at date,
  condition_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subscription_id,referrer_user_id,starts_at)
);

CREATE TABLE invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  subscription_id uuid NOT NULL REFERENCES subscriptions(id),
  provider text NOT NULL DEFAULT 'MERCADO_PAGO',
  provider_charge_id text,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  due_at date NOT NULL,
  grace_deadline date NOT NULL,
  status payment_status NOT NULL DEFAULT 'PENDING',
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider,provider_charge_id),
  UNIQUE (tenant_id,id)
);

CREATE TABLE payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  request_id text,
  signature_valid boolean NOT NULL,
  payload jsonb NOT NULL,
  processed_at timestamptz,
  processing_error text,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider,provider_event_id)
);

CREATE TABLE business_calendar (
  calendar_date date PRIMARY KEY,
  is_business_day boolean NOT NULL,
  description text
);

CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id),
  actor_user_id uuid REFERENCES users(id),
  actor_type text NOT NULL CHECK (actor_type IN ('USER','SYSTEM','INTEGRATION')),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  before_data jsonb,
  after_data jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_events_tenant_time_idx ON audit_events(tenant_id,created_at DESC);
CREATE INDEX analyses_tenant_status_idx ON analyses(tenant_id,status,updated_at DESC);
CREATE INDEX lab_results_sample_idx ON lab_results(tenant_id,lab_sample_id);

COMMIT;
