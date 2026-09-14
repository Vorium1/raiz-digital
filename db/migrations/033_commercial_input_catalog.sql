BEGIN;

CREATE TABLE commercial_input_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  code text NOT NULL CHECK (char_length(code) BETWEEN 1 AND 80),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 160),
  kind text NOT NULL CHECK (kind IN ('FERTILIZER','LIMESTONE','CORRECTIVE')),
  guarantees_percent jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(guarantees_percent) = 'object'),
  prnt_percent numeric(10,4) CHECK (prnt_percent IS NULL OR prnt_percent > 0),
  price_per_ton numeric(14,2) CHECK (price_per_ton IS NULL OR price_per_ton >= 0),
  min_rate_kg_ha numeric(14,4) CHECK (min_rate_kg_ha IS NULL OR min_rate_kg_ha >= 0),
  max_rate_kg_ha numeric(14,4) CHECK (max_rate_kg_ha IS NULL OR max_rate_kg_ha >= 0),
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, code),
  CHECK (min_rate_kg_ha IS NULL OR max_rate_kg_ha IS NULL OR min_rate_kg_ha <= max_rate_kg_ha)
);

CREATE INDEX commercial_input_products_tenant_active_idx
  ON commercial_input_products (tenant_id, active, name);

DROP TRIGGER IF EXISTS commercial_input_products_touch_updated_at ON commercial_input_products;
CREATE TRIGGER commercial_input_products_touch_updated_at
BEFORE UPDATE ON commercial_input_products
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

ALTER TABLE commercial_input_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial_input_products FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON commercial_input_products
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

-- Catálogo nunca é apagado pelo runtime: desativação preserva histórico e rastreabilidade.
GRANT SELECT, INSERT, UPDATE ON commercial_input_products TO raiz_app;

COMMENT ON TABLE commercial_input_products IS
  'Catálogo comercial por tenant. Fórmula/preço/logística são dados declarados pela empresa; não representam regra agronômica e não são preenchidos por IA.';

COMMIT;
