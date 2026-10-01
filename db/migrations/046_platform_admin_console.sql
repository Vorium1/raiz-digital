BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_platform_admin boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS platform_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL REFERENCES users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_audit_events_actor_created_idx
  ON platform_audit_events (actor_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS platform_audit_events_entity_created_idx
  ON platform_audit_events (entity_type, entity_id, created_at DESC);

GRANT SELECT, INSERT ON platform_audit_events TO raiz_app;

COMMIT;
