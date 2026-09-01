import { withTenant } from "@/lib/db";
import { writeAudit } from "@/lib/repositories/audit";

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
