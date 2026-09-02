import { withTenant } from "@/lib/db";
import { writeAudit } from "@/lib/repositories/audit";

export class TeamError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = "TeamError";
  }
}

export async function inviteTeamMember(input: {
  tenantId: string;
  userId: string;
  name: string;
  email: string;
  role: string;
  temporaryPasswordHash: string;
}) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const existing = await client.query<{ id: string }>(`SELECT id::text FROM users WHERE email = $1::citext LIMIT 1`, [input.email]);
    let targetUserId: string;
    let createdNewUser: boolean;

    if (existing.rows[0]) {
      targetUserId = existing.rows[0].id;
      createdNewUser = false;
    } else {
      const created = await client.query<{ id: string }>(
        `INSERT INTO users (name, email, password_hash) VALUES ($1, $2::citext, $3) RETURNING id::text`,
        [input.name, input.email, input.temporaryPasswordHash],
      );
      targetUserId = created.rows[0].id;
      createdNewUser = true;
    }

    const already = await client.query(
      `SELECT 1 FROM tenant_members WHERE tenant_id = $1::uuid AND user_id = $2::uuid`,
      [input.tenantId, targetUserId],
    );
    if (already.rows[0]) throw new TeamError("Esse e-mail já é membro desta empresa.", 409);

    await client.query(
      `INSERT INTO tenant_members (tenant_id, user_id, role, active) VALUES ($1::uuid, $2::uuid, $3, true)`,
      [input.tenantId, targetUserId, input.role],
    );

    await writeAudit(client, {
      tenantId: input.tenantId,
      userId: input.userId,
      action: "TEAM_MEMBER_INVITED",
      entityType: "user",
      entityId: targetUserId,
      metadata: { email: input.email, role: input.role, newAccount: createdNewUser },
    });

    return { userId: targetUserId, createdNewUser };
  });
}

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
