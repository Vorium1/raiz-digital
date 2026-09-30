BEGIN;

-- Cadastro mestre incremental: os registros legados não recebem tipo ou documento
-- inferidos. A ausência permanece explícita até revisão humana.
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS person_type text CHECK (person_type IN ('PF', 'PJ')),
  ADD COLUMN IF NOT EXISTS document_normalized text,
  ADD COLUMN IF NOT EXISTS trade_name text,
  ADD COLUMN IF NOT EXISTS contact_name text,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS archive_reason text;

ALTER TABLE clients
  ADD CONSTRAINT clients_document_normalized_format
  CHECK (document_normalized IS NULL OR document_normalized ~ '^[0-9]{11}$|^[0-9]{14}$') NOT VALID;

CREATE UNIQUE INDEX IF NOT EXISTS clients_tenant_document_normalized_uidx
  ON clients (tenant_id, document_normalized)
  WHERE document_normalized IS NOT NULL;

CREATE INDEX IF NOT EXISTS clients_tenant_active_name_idx
  ON clients (tenant_id, name)
  WHERE archived_at IS NULL;

-- Clientes continuam sujeitos à política tenant_isolation e ao FORCE RLS já
-- existente; este reforço torna o contrato explícito para a nova superfície.
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients FORCE ROW LEVEL SECURITY;

COMMIT;
