import type { PoolClient } from "pg";
import { withTenant } from "@/lib/db";

export async function listAuditEvents(tenantId: string, userId?: string, limit = 100) {
  return withTenant({ tenantId, userId }, async (client) => {
    const result = await client.query(
      `SELECT ae.id::text, ae.action, ae.entity_type AS "entityType", ae.entity_id::text AS "entityId",
              ae.created_at::text AS "createdAt", ae.metadata,
              u.name AS "actorName", u.email::text AS "actorEmail"
       FROM audit_events ae
       LEFT JOIN users u ON u.id = ae.actor_user_id
       ORDER BY ae.created_at DESC
       LIMIT $1`,
      [limit],
    );
    return result.rows;
  });
}

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
