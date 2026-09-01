import type { PoolClient } from "pg";

export async function writeAudit(client: PoolClient, input: {
  tenantId: string;
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await client.query(
    `INSERT INTO audit_events
     (tenant_id, actor_user_id, actor_type, action, entity_type, entity_id, metadata)
     VALUES ($1::uuid, $2::uuid, 'USER', $3, $4, $5::uuid, $6::jsonb)`,
    [input.tenantId, input.userId ?? null, input.action, input.entityType, input.entityId ?? null, JSON.stringify(input.metadata ?? {})],
  );
}
