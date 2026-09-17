BEGIN;

-- Decision delivery status resolves whether a REPORT_PUBLISHED event belongs to the exact
-- prescription frozen in the report snapshot. Keep that lookup selective as audit_events grows.
CREATE INDEX IF NOT EXISTS audit_events_entity_action_idx
  ON audit_events (tenant_id, entity_type, entity_id, action)
  WHERE entity_id IS NOT NULL;

COMMIT;
