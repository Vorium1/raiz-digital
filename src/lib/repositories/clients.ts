import { withTenant } from "@/lib/db";
import { writeAudit } from "@/lib/repositories/audit";

export class ClientError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = "ClientError";
  }
}

export type ClientListItem = {
  id: string;
  name: string;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  properties: number;
  hectares: number;
  analyses: number;
  createdAt: string;
};

export async function listClients(tenantId: string, userId?: string) {
  return withTenant({ tenantId, userId }, async (client) => {
    const result = await client.query<ClientListItem>(
      `SELECT
         c.id::text AS id,
         c.name,
         c.tax_id AS "taxId",
         c.email::text AS email,
         c.phone,
         (SELECT count(*)::int FROM properties p WHERE p.tenant_id = c.tenant_id AND p.client_id = c.id) AS properties,
         (SELECT coalesce(sum(f.area_ha),0)::float8
            FROM properties p
            JOIN fields f ON f.tenant_id = p.tenant_id AND f.property_id = p.id
           WHERE p.tenant_id = c.tenant_id AND p.client_id = c.id) AS hectares,
         (SELECT count(*)::int
            FROM properties p
            JOIN fields f ON f.tenant_id = p.tenant_id AND f.property_id = p.id
            JOIN crop_seasons cs ON cs.tenant_id = f.tenant_id AND cs.field_id = f.id
            JOIN analyses a ON a.tenant_id = cs.tenant_id AND a.crop_season_id = cs.id
           WHERE p.tenant_id = c.tenant_id AND p.client_id = c.id) AS analyses,
         c.created_at::text AS "createdAt"
       FROM clients c
       ORDER BY c.name ASC`,
    );
    return result.rows;
  });
}

export async function createClient(input: {
  tenantId: string;
  userId: string;
  name: string;
  taxId?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
}) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const result = await client.query<ClientListItem>(
      `INSERT INTO clients (tenant_id, name, tax_id, email, phone, notes)
       VALUES ($1::uuid, $2, nullif($3,''), nullif($4,'')::citext, nullif($5,''), nullif($6,''))
       RETURNING id::text AS id, name, tax_id AS "taxId", email::text AS email, phone,
                 0::int AS properties, 0::float8 AS hectares, 0::int AS analyses,
                 created_at::text AS "createdAt"`,
      [input.tenantId, input.name.trim(), input.taxId ?? "", input.email?.trim().toLowerCase() ?? "", input.phone ?? "", input.notes ?? ""],
    );
    const created = result.rows[0];
    await writeAudit(client, {
      tenantId: input.tenantId,
      userId: input.userId,
      action: "CLIENT_CREATED",
      entityType: "client",
      entityId: created.id,
      metadata: { name: created.name },
    });
    return created;
  });
}

export async function updateClient(input: {
  tenantId: string;
  userId: string;
  clientId: string;
  name: string;
  taxId?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
}) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const result = await client.query<ClientListItem>(
      `UPDATE clients
       SET name = $3, tax_id = nullif($4,''), email = nullif($5,'')::citext, phone = nullif($6,''), notes = nullif($7,''), updated_at = now()
       WHERE tenant_id = $1::uuid AND id = $2::uuid
       RETURNING id::text AS id, name, tax_id AS "taxId", email::text AS email, phone,
                 (SELECT count(*)::int FROM properties p WHERE p.tenant_id = clients.tenant_id AND p.client_id = clients.id) AS properties,
                 (SELECT coalesce(sum(f.area_ha),0)::float8 FROM properties p JOIN fields f ON f.tenant_id = p.tenant_id AND f.property_id = p.id WHERE p.tenant_id = clients.tenant_id AND p.client_id = clients.id) AS hectares,
                 0::int AS analyses,
                 created_at::text AS "createdAt"`,
      [input.tenantId, input.clientId, input.name.trim(), input.taxId ?? "", input.email?.trim().toLowerCase() ?? "", input.phone ?? "", input.notes ?? ""],
    );
    const updated = result.rows[0];
    if (!updated) throw new ClientError("Cliente não encontrado.", 404);
    await writeAudit(client, {
      tenantId: input.tenantId,
      userId: input.userId,
      action: "CLIENT_UPDATED",
      entityType: "client",
      entityId: updated.id,
      metadata: { name: updated.name },
    });
    return updated;
  });
}

export async function deleteClient(input: { tenantId: string; userId: string; clientId: string }) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    let result;
    try {
      result = await client.query<{ id: string; name: string }>(
        `DELETE FROM clients WHERE tenant_id = $1::uuid AND id = $2::uuid RETURNING id::text, name`,
        [input.tenantId, input.clientId],
      );
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "23503") {
        throw new ClientError("Não é possível excluir: este cliente já tem propriedades ou histórico cadastrado.", 409);
      }
      throw error;
    }
    const deleted = result.rows[0];
    if (!deleted) throw new ClientError("Cliente não encontrado.", 404);
    await writeAudit(client, {
      tenantId: input.tenantId,
      userId: input.userId,
      action: "CLIENT_DELETED",
      entityType: "client",
      entityId: deleted.id,
      metadata: { name: deleted.name },
    });
    return deleted;
  });
}
