import { withTenant } from "@/lib/db";

export async function listTenantMembers(tenantId: string, userId?: string) {
  return withTenant({ tenantId, userId }, async (client) => {
    const result = await client.query(
      `SELECT u.id::text, u.name, u.email::text AS email, tm.role::text AS role, tm.active,
              u.last_login_at::text AS "lastLoginAt", tm.created_at::text AS "memberSince"
       FROM tenant_members tm
       JOIN users u ON u.id = tm.user_id
       WHERE tm.tenant_id = $1::uuid
       ORDER BY tm.active DESC, u.name ASC`,
      [tenantId],
    );
    return result.rows;
  });
}
