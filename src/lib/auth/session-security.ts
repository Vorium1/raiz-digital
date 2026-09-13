import { query } from "@/lib/db";

export type ActiveUserSession = {
  id: string;
  tenantId: string | null;
  tenantName: string | null;
  userAgent: string | null;
  createdAt: string;
  expiresAt: string;
  current: boolean;
};

export async function listOwnActiveSessions(userId: string, currentSessionId: string): Promise<ActiveUserSession[]> {
  const result = await query<ActiveUserSession>(
    `SELECT
       s.id::text AS id,
       s.tenant_id::text AS "tenantId",
       membership.trade_name AS "tenantName",
       s.user_agent AS "userAgent",
       s.created_at::text AS "createdAt",
       s.expires_at::text AS "expiresAt",
       (s.id = $2::uuid) AS current
     FROM user_sessions s
     LEFT JOIN LATERAL app.user_memberships($1::uuid) membership
       ON membership.tenant_id = s.tenant_id
     WHERE s.user_id = $1::uuid
       AND s.revoked_at IS NULL
       AND s.expires_at > now()
     ORDER BY (s.id = $2::uuid) DESC, s.created_at DESC`,
    [userId, currentSessionId],
  );
  return result.rows;
}

export async function revokeOwnOtherSessions(userId: string, currentSessionId: string) {
  const result = await query<{ id: string }>(
    `UPDATE user_sessions
     SET revoked_at = now()
     WHERE user_id = $1::uuid
       AND id <> $2::uuid
       AND revoked_at IS NULL
     RETURNING id::text AS id`,
    [userId, currentSessionId],
  );
  return result.rowCount ?? 0;
}
