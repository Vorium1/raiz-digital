BEGIN;

-- Escopo geográfico explícito das regiões técnicas.
--
-- Ordem de especificidade no resolvedor:
--   boundary (polígono/subclima) > municipality_codes > state_codes > country_code.
--
-- Isso permite começar por RS/SC e expandir para recortes de PR e demais UFs
-- sem reutilizar regras por proximidade geográfica ou analogia.

ALTER TABLE technical_regions
  ADD COLUMN IF NOT EXISTS country_code text NOT NULL DEFAULT 'BR',
  ADD COLUMN IF NOT EXISTS state_codes text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS municipality_codes text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS parent_region_code text REFERENCES technical_regions(code),
  ADD COLUMN IF NOT EXISTS climate_zone_code text,
  ADD COLUMN IF NOT EXISTS boundary geometry(MultiPolygon, 4326),
  ADD COLUMN IF NOT EXISTS valid_from date,
  ADD COLUMN IF NOT EXISTS valid_until date,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE technical_regions
  DROP CONSTRAINT IF EXISTS technical_regions_country_code_check;

ALTER TABLE technical_regions
  ADD CONSTRAINT technical_regions_country_code_check
  CHECK (country_code ~ '^[A-Z]{2}$');

ALTER TABLE technical_regions
  DROP CONSTRAINT IF EXISTS technical_regions_validity_check;

ALTER TABLE technical_regions
  ADD CONSTRAINT technical_regions_validity_check
  CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from);

CREATE INDEX IF NOT EXISTS technical_regions_boundary_gix
  ON technical_regions USING gist (boundary);

CREATE INDEX IF NOT EXISTS technical_regions_state_codes_gin
  ON technical_regions USING gin (state_codes);

CREATE INDEX IF NOT EXISTS technical_regions_municipality_codes_gin
  ON technical_regions USING gin (municipality_codes);

COMMENT ON COLUMN technical_regions.boundary IS
  'Polígono WGS84 opcional para sub-região/subclima. Quando preenchido, tem precedência sobre município/UF e exige correspondência espacial explícita.';

COMMENT ON COLUMN technical_regions.state_codes IS
  'UFs brasileiras explicitamente cobertas quando boundary e municipality_codes estiverem vazios. Não inferir estados adjacentes.';

COMMENT ON COLUMN technical_regions.municipality_codes IS
  'Códigos de município explicitamente cobertos quando boundary estiver vazio. Preferir código IBGE quando disponível.';

COMMENT ON COLUMN technical_regions.climate_zone_code IS
  'Identificador técnico opcional de zona/subclima; não substitui boundary nem escopo administrativo.';

-- Regiões administrativas-base. Elas NÃO são subclimas e não homologam regras por si só;
-- apenas permitem resolver a UF de forma explícita enquanto recortes mais específicos
-- (município/polígono) são cadastrados e homologados.
INSERT INTO technical_regions (code, name, description, country_code, state_codes)
VALUES
  ('BR', 'Brasil', 'Região técnica-base nacional. Usada apenas quando a fonte sustenta abrangência nacional explícita.', 'BR', ARRAY[]::text[]),
  ('BR-RS', 'Rio Grande do Sul', 'Região técnica-base por UF. Regras climáticas só entram quando a fonte declarar escopo compatível.', 'BR', ARRAY['RS']::text[]),
  ('BR-SC', 'Santa Catarina', 'Região técnica-base por UF. Regras climáticas só entram quando a fonte declarar escopo compatível.', 'BR', ARRAY['SC']::text[]),
  ('BR-PR', 'Paraná', 'Região técnica-base por UF. Não implica que regras RS/SC se transfiram ao PR inteiro.', 'BR', ARRAY['PR']::text[])
ON CONFLICT (code) DO UPDATE SET
  country_code = EXCLUDED.country_code,
  state_codes = EXCLUDED.state_codes,
  updated_at = now();

COMMIT;
