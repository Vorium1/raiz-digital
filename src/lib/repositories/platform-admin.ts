import { getPool, query, withTenant } from "@/lib/db";

export type PlatformTenantStatus = "ACTIVE" | "BLOCKED" | "CANCELED";

export type PlatformTenantSummary = {
  id: string;
  legalName: string;
  tradeName: string;
  status: PlatformTenantStatus;
  activeMembers: number;
  activeAdmins: number;
  createdAt: string;
};

export class PlatformAdminError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = "PlatformAdminError";
  }
}

export async function listPlatformTenants() {
  const result = await query<Omit<PlatformTenantSummary, "activeMembers" | "activeAdmins">>(
    `SELECT
       t.id::text AS id,
       t.legal_name AS "legalName",
       t.trade_name AS "tradeName",
       t.status::text AS status,
       t.created_at::text AS "createdAt"
     FROM tenants t
     ORDER BY t.status = 'ACTIVE' DESC, t.trade_name ASC`,
  );

  return Promise.all(result.rows.map(async (tenant) => {
    const membershipCounts = await withTenant({ tenantId: tenant.id }, async (client) => {
      const counts = await client.query<{ activeMembers: number; activeAdmins: number }>(
        `SELECT
           count(*) FILTER (WHERE active = true)::int AS "activeMembers",
           count(*) FILTER (WHERE active = true AND role IN ('SUPER_ADMIN','TENANT_ADMIN'))::int AS "activeAdmins"
         FROM tenant_members
         WHERE tenant_id = $1::uuid`,
        [tenant.id],
      );
      return counts.rows[0] ?? { activeMembers: 0, activeAdmins: 0 };
    });
    return { ...tenant, ...membershipCounts };
  }));
}

export async function createPlatformTenant(input: {
  actorUserId: string;
  legalName: string;
  tradeName: string;
  taxId?: string | null;
  timezone?: string | null;
}) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const created = await client.query<{ id: string; tradeName: string }>(
      `INSERT INTO tenants (legal_name, trade_name, tax_id, timezone)
       VALUES ($1, $2, nullif($3,''), coalesce(nullif($4,''), 'America/Sao_Paulo'))
       RETURNING id::text AS id, trade_name AS "tradeName"`,
      [input.legalName.trim(), input.tradeName.trim(), input.taxId?.trim() ?? "", input.timezone?.trim() ?? ""],
    );
    const tenant = created.rows[0];
    await client.query(
      `INSERT INTO platform_audit_events (actor_user_id, action, entity_type, entity_id, metadata)
       VALUES ($1::uuid, 'TENANT_CREATED', 'tenant', $2::uuid, jsonb_build_object('tradeName', $3))`,
      [input.actorUserId, tenant.id, tenant.tradeName],
    );
    await client.query("COMMIT");
    return tenant;
  } catch (error) {
    await client.query("ROLLBACK");
    if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "23505") {
      throw new PlatformAdminError("Já existe uma empresa com este CNPJ/CPF cadastrado.", 409);
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function updatePlatformTenantStatus(input: {
  actorUserId: string;
  tenantId: string;
  status: PlatformTenantStatus;
}) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const current = await client.query<{ status: PlatformTenantStatus }>(
      "SELECT status::text AS status FROM tenants WHERE id = $1::uuid FOR UPDATE",
      [input.tenantId],
    );
    const before = current.rows[0];
    if (!before) throw new PlatformAdminError("Empresa não encontrada.", 404);
    if (before.status === input.status) {
      await client.query("COMMIT");
      return;
    }
    await client.query(
      "UPDATE tenants SET status = $2, updated_at = now() WHERE id = $1::uuid",
      [input.tenantId, input.status],
    );
    await client.query(
      `INSERT INTO platform_audit_events (actor_user_id, action, entity_type, entity_id, metadata)
       VALUES ($1::uuid, 'TENANT_STATUS_CHANGED', 'tenant', $2::uuid,
               jsonb_build_object('from', $3::text, 'to', $4::text))`,
      [input.actorUserId, input.tenantId, before.status, input.status],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function createFirstTenantAdmin(input: {
  actorUserId: string;
  tenantId: string;
  name: string;
  email: string;
  bootstrapPasswordHash: string;
}) {
  return withTenant({ tenantId: input.tenantId, userId: input.actorUserId }, async (client) => {
    const tenantResult = await client.query<{ tradeName: string }>(
      `SELECT trade_name AS "tradeName" FROM tenants WHERE id = $1::uuid`,
      [input.tenantId],
    );
    const tenant = tenantResult.rows[0];
    if (!tenant) throw new PlatformAdminError("Empresa não encontrada.", 404);

    const admins = await client.query(
      `SELECT 1 FROM tenant_members
       WHERE tenant_id = $1::uuid AND active = true AND role IN ('SUPER_ADMIN','TENANT_ADMIN')
       LIMIT 1
       FOR UPDATE`,
      [input.tenantId],
    );
    if (admins.rows[0]) throw new PlatformAdminError("Esta empresa já possui administrador ativo.", 409);

    const existing = await client.query<{ id: string }>(
      "SELECT id::text FROM users WHERE email = $1::citext LIMIT 1",
      [input.email.trim().toLowerCase()],
    );
    let userId = existing.rows[0]?.id;
    const createdNewUser = !userId;

    if (!userId) {
      const created = await client.query<{ id: string }>(
        `INSERT INTO users (name, email, password_hash)
         VALUES ($1, $2::citext, $3)
         RETURNING id::text`,
        [input.name.trim(), input.email.trim().toLowerCase(), input.bootstrapPasswordHash],
      );
      userId = created.rows[0].id;
    }

    const membership = await client.query(
      "SELECT 1 FROM tenant_members WHERE tenant_id = $1::uuid AND user_id = $2::uuid",
      [input.tenantId, userId],
    );
    if (membership.rows[0]) {
      await client.query(
        `UPDATE tenant_members
         SET role = 'TENANT_ADMIN', active = true
         WHERE tenant_id = $1::uuid AND user_id = $2::uuid`,
        [input.tenantId, userId],
      );
    } else {
      await client.query(
        `INSERT INTO tenant_members (tenant_id, user_id, role, active)
         VALUES ($1::uuid, $2::uuid, 'TENANT_ADMIN', true)`,
        [input.tenantId, userId],
      );
    }

    await client.query(
      `INSERT INTO platform_audit_events (actor_user_id, action, entity_type, entity_id, metadata)
       VALUES ($1::uuid, 'TENANT_FIRST_ADMIN_CREATED', 'tenant', $2::uuid,
               jsonb_build_object('newAccount', $3::boolean))`,
      [input.actorUserId, input.tenantId, createdNewUser],
    );

    return { userId, tenantName: tenant.tradeName, createdNewUser };
  });
}
