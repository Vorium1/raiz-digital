BEGIN;

-- Registra apenas tentativas de login malsucedidas, para permitir bloqueio
-- temporário por força bruta. Sem tenant_id (login acontece antes de haver
-- contexto de empresa) e sem RLS, no mesmo padrão de `users`/`user_sessions`.
CREATE TABLE login_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL,
  ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX login_attempts_email_idx ON login_attempts (email, created_at DESC);

COMMIT;
