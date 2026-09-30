BEGIN;

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS whatsapp text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS street text,
  ADD COLUMN IF NOT EXISTS address_number text,
  ADD COLUMN IF NOT EXISTS address_complement text,
  ADD COLUMN IF NOT EXISTS district text,
  ADD COLUMN IF NOT EXISTS municipality text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS country text DEFAULT 'BR';

ALTER TABLE clients
  ADD CONSTRAINT clients_postal_code_format
    CHECK (postal_code IS NULL OR postal_code ~ '^[0-9]{8}$') NOT VALID,
  ADD CONSTRAINT clients_state_format
    CHECK (state IS NULL OR state ~ '^[A-Z]{2}$') NOT VALID,
  ADD CONSTRAINT clients_country_format
    CHECK (country IS NULL OR country ~ '^[A-Z]{2}$') NOT VALID;

CREATE INDEX IF NOT EXISTS clients_tenant_municipality_idx
  ON clients (tenant_id, municipality, state)
  WHERE archived_at IS NULL;

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients FORCE ROW LEVEL SECURITY;

COMMIT;
