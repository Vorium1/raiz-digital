BEGIN;

CREATE OR REPLACE FUNCTION app.current_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid
$$;

CREATE TABLE user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  user_agent text,
  ip_hash text,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX user_sessions_user_idx ON user_sessions(user_id, expires_at DESC);
CREATE INDEX user_sessions_tenant_idx ON user_sessions(tenant_id, expires_at DESC);
CREATE INDEX user_sessions_active_idx ON user_sessions(token_hash) WHERE revoked_at IS NULL;

-- A importação inconsistente precisa preservar também as linhas duplicadas que
-- causaram o bloqueio. O UNIQUE da versão 0.3 impedia esse registro fiel.
DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT c.conname INTO constraint_name
  FROM pg_constraint c
  WHERE c.conrelid = 'analysis_import_rows'::regclass
    AND c.contype = 'u'
    AND pg_get_constraintdef(c.oid) ILIKE '%tenant_id%import_id%sample_code%parameter_code%analytical_method%'
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE analysis_import_rows DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS analysis_import_rows_source_line_uidx
  ON analysis_import_rows(tenant_id, import_id, source_line, sample_code, parameter_code);

ALTER TABLE laboratories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS laboratory_scope ON laboratories;
CREATE POLICY laboratory_scope ON laboratories
  USING (tenant_id IS NULL OR tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON audit_events;
CREATE POLICY tenant_isolation ON audit_events
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

-- Login precisa descobrir as empresas do usuário antes que um tenant tenha sido
-- selecionado. Esta função expõe apenas memberships do próprio id consultado e
-- não retorna dados de negócio do tenant.
CREATE OR REPLACE FUNCTION app.user_memberships(p_user_id uuid)
RETURNS TABLE(tenant_id uuid, trade_name text, role user_role)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT tm.tenant_id, t.trade_name, tm.role
  FROM tenant_members tm
  JOIN tenants t ON t.id = tm.tenant_id
  WHERE tm.user_id = p_user_id
    AND tm.active = true
    AND t.status = 'ACTIVE'
  ORDER BY t.created_at ASC
$$;

CREATE OR REPLACE FUNCTION app.is_tenant_member(p_user_id uuid, p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM tenant_members tm
    JOIN tenants t ON t.id = tm.tenant_id
    WHERE tm.user_id = p_user_id
      AND tm.tenant_id = p_tenant_id
      AND tm.active = true
      AND t.status = 'ACTIVE'
  )
$$;

COMMIT;
