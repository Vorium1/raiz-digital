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

const manageableRoles = new Set(["TENANT_ADMIN", "AGRONOMIST", "FIELD_TECH", "COMMERCIAL", "VIEWER"]);
const adminRoles = new Set(["SUPER_ADMIN", "TENANT_ADMIN"]);

async function countActiveAdmins(client: import("pg").PoolClient, tenantId: string, excludingUserId?: string) {
  const result = await client.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM tenant_members
     WHERE tenant_id = $1::uuid AND active = true AND role IN ('SUPER_ADMIN','TENANT_ADMIN')
       AND ($2::uuid IS NULL OR user_id <> $2::uuid)`,
    [tenantId, excludingUserId ?? null],
  );
  return result.rows[0]?.count ?? 0;
}

export async function updateTeamMemberRole(input: { tenantId: string; actorUserId: string; targetUserId: string; role: string }) {
  if (!manageableRoles.has(input.role)) throw new TeamError("Perfil inválido.", 400);
  return withTenant({ tenantId: input.tenantId, userId: input.actorUserId }, async (client) => {
    const current = await client.query<{ role: string; active: boolean }>(
      `SELECT role::text, active FROM tenant_members WHERE tenant_id = $1::uuid AND user_id = $2::uuid`,
      [input.tenantId, input.targetUserId],
    );
    const row = current.rows[0];
    if (!row) throw new TeamError("Membro não encontrado nesta empresa.", 404);

    if (adminRoles.has(row.role) && !adminRoles.has(input.role) && row.active) {
      const remaining = await countActiveAdmins(client, input.tenantId, input.targetUserId);
      if (remaining === 0) throw new TeamError("Não é possível rebaixar: este é o único administrador ativo da empresa.", 409);
    }

    await client.query(
      `UPDATE tenant_members SET role = $3 WHERE tenant_id = $1::uuid AND user_id = $2::uuid`,
      [input.tenantId, input.targetUserId, input.role],
    );
    await writeAudit(client, {
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "TEAM_MEMBER_ROLE_CHANGED",
      entityType: "user",
      entityId: input.targetUserId,
      metadata: { from: row.role, to: input.role },
    });
  });
}

export async function setTeamMemberActive(input: { tenantId: string; actorUserId: string; targetUserId: string; active: boolean }) {
  if (input.targetUserId === input.actorUserId) throw new TeamError("Você não pode desativar o seu próprio acesso.", 400);
  return withTenant({ tenantId: input.tenantId, userId: input.actorUserId }, async (client) => {
    const current = await client.query<{ role: string; active: boolean }>(
      `SELECT role::text, active FROM tenant_members WHERE tenant_id = $1::uuid AND user_id = $2::uuid`,
      [input.tenantId, input.targetUserId],
    );
    const row = current.rows[0];
    if (!row) throw new TeamError("Membro não encontrado nesta empresa.", 404);

    if (!input.active && adminRoles.has(row.role) && row.active) {
      const remaining = await countActiveAdmins(client, input.tenantId, input.targetUserId);
      if (remaining === 0) throw new TeamError("Não é possível desativar: este é o único administrador ativo da empresa.", 409);
    }

    await client.query(
      `UPDATE tenant_members SET active = $3 WHERE tenant_id = $1::uuid AND user_id = $2::uuid`,
      [input.tenantId, input.targetUserId, input.active],
    );
    if (!input.active) {
      await client.query(
        `UPDATE user_sessions SET revoked_at = now() WHERE tenant_id = $1::uuid AND user_id = $2::uuid AND revoked_at IS NULL`,
        [input.tenantId, input.targetUserId],
      );
    }
    await writeAudit(client, {
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: input.active ? "TEAM_MEMBER_REACTIVATED" : "TEAM_MEMBER_DEACTIVATED",
      entityType: "user",
      entityId: input.targetUserId,
      metadata: {},
    });
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
