BEGIN;

-- totp_secret fica vazio até o usuário confirmar a ativação (ver two_factor_enabled).
ALTER TABLE users ADD COLUMN totp_secret text;

-- Backup codes de uso único, para quando o usuário perde o dispositivo autenticador.
-- Mesmo padrão de token opaco hasheado usado em password_reset_tokens: nunca guardamos o código em texto puro.
CREATE TABLE totp_backup_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, code_hash)
);

CREATE INDEX totp_backup_codes_user_idx ON totp_backup_codes (user_id) WHERE used_at IS NULL;

-- Estado intermediário entre "senha confirmada" e "sessão criada", enquanto o
-- código TOTP não é digitado. Sem RLS/tenant, mesmo padrão de user_sessions:
-- este momento acontece antes de existir uma sessão de fato.
CREATE TABLE pending_two_factor_logins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  user_agent text,
  ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- token_hash já tem índice único implícito (UNIQUE acima); um índice extra por expires_at
-- ajuda a limpeza periódica de tokens vencidos sem precisar de predicado (now() não é IMMUTABLE).
CREATE INDEX pending_two_factor_logins_expires_idx ON pending_two_factor_logins (expires_at);

COMMIT;
