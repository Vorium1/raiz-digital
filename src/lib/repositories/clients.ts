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
  whatsapp: string | null;
  postalCode: string | null;
  street: string | null;
  addressNumber: string | null;
  addressComplement: string | null;
  district: string | null;
  municipality: string | null;
  state: string | null;
  country: string | null;
  personType: "PF" | "PJ" | null;
  tradeName: string | null;
  contactName: string | null;
  notes: string | null;
  archivedAt: string | null;
  properties: number;
  hectares: number;
  analyses: number;
  createdAt: string;
};

export async function listClients(tenantId: string, userId?: string, includeArchived = false) {
  return withTenant({ tenantId, userId }, async (client) => {
    const result = await client.query<ClientListItem>(
      `SELECT
         c.id::text AS id,
         c.name,
         c.tax_id AS "taxId",
         c.email::text AS email,
         c.phone,
         c.whatsapp,
         c.postal_code AS "postalCode",
         c.street,
         c.address_number AS "addressNumber",
         c.address_complement AS "addressComplement",
         c.district,
         c.municipality,
         c.state,
         c.country,
         c.person_type AS "personType", c.trade_name AS "tradeName", c.contact_name AS "contactName", c.notes,
         c.archived_at::text AS "archivedAt",
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
       WHERE c.tenant_id = $1::uuid AND ($2::boolean OR c.archived_at IS NULL)
       ORDER BY c.name ASC`,
      [tenantId, includeArchived],
    );
    return result.rows;
  });
}

export async function getClient360(tenantId: string, clientId: string, userId?: string) {
  return withTenant({ tenantId, userId }, async (client) => {
    const clientResult = await client.query<ClientListItem>(
      `SELECT c.id::text AS id, c.name, c.tax_id AS "taxId", c.email::text AS email, c.phone,
              c.whatsapp, c.postal_code AS "postalCode", c.street,
              c.address_number AS "addressNumber", c.address_complement AS "addressComplement",
              c.district, c.municipality, c.state, c.country,
              c.person_type AS "personType", c.trade_name AS "tradeName", c.contact_name AS "contactName", c.notes,
              c.archived_at::text AS "archivedAt",
              (SELECT count(*)::int FROM properties p WHERE p.tenant_id = c.tenant_id AND p.client_id = c.id) AS properties,
              (SELECT coalesce(sum(f.area_ha), 0)::float8 FROM properties p JOIN fields f ON f.tenant_id = p.tenant_id AND f.property_id = p.id WHERE p.tenant_id = c.tenant_id AND p.client_id = c.id) AS hectares,
              (SELECT count(*)::int FROM properties p JOIN fields f ON f.tenant_id = p.tenant_id AND f.property_id = p.id JOIN crop_seasons cs ON cs.tenant_id = f.tenant_id AND cs.field_id = f.id JOIN analyses a ON a.tenant_id = cs.tenant_id AND a.crop_season_id = cs.id WHERE p.tenant_id = c.tenant_id AND p.client_id = c.id) AS analyses,
              c.created_at::text AS "createdAt"
       FROM clients c WHERE c.tenant_id = $1::uuid AND c.id = $2::uuid`,
      [tenantId, clientId],
    );
    const item = clientResult.rows[0];
    if (!item) throw new ClientError("Cliente não encontrado.", 404);

    const properties = await client.query<{
      id: string;
      name: string;
      municipality: string;
      state: string;
      fields: number;
      hectares: number;
    }>(
      `SELECT p.id::text AS id, p.name, p.municipality, p.state, count(f.id)::int AS fields,
              coalesce(sum(f.area_ha), 0)::float8 AS hectares
       FROM properties p LEFT JOIN fields f ON f.tenant_id = p.tenant_id AND f.property_id = p.id
       WHERE p.tenant_id = $1::uuid AND p.client_id = $2::uuid
       GROUP BY p.id ORDER BY p.name`,
      [tenantId, clientId],
    );

    const fields = await client.query<{
      id: string;
      propertyId: string;
      name: string;
      areaHa: number;
    }>(
      `SELECT f.id::text AS id, f.property_id::text AS "propertyId", f.name, f.area_ha::float8 AS "areaHa"
       FROM fields f
       JOIN properties p ON p.tenant_id = f.tenant_id AND p.id = f.property_id
       WHERE f.tenant_id = $1::uuid AND p.client_id = $2::uuid
       ORDER BY p.name, f.name`,
      [tenantId, clientId],
    );

    const seasons = await client.query<{
      id: string; fieldId: string; fieldName: string; propertyName: string; seasonLabel: string;
      currentCrop: string | null; nextCrop: string | null;
    }>(
      `SELECT cs.id::text, cs.field_id::text AS "fieldId", f.name AS "fieldName",
              p.name AS "propertyName", cs.season_label AS "seasonLabel",
              cs.current_crop AS "currentCrop", cs.next_crop AS "nextCrop"
       FROM crop_seasons cs
       JOIN fields f ON f.tenant_id = cs.tenant_id AND f.id = cs.field_id
       JOIN properties p ON p.tenant_id = f.tenant_id AND p.id = f.property_id
       WHERE cs.tenant_id = $1::uuid AND p.client_id = $2::uuid
       ORDER BY cs.created_at DESC, cs.id`, [tenantId, clientId],
    );
    const analyses = await client.query<{
      id: string; code: string; status: string; fieldName: string; seasonLabel: string; createdAt: string;
    }>(
      `SELECT a.id::text, a.code, a.status::text, f.name AS "fieldName",
              cs.season_label AS "seasonLabel", a.created_at::text AS "createdAt"
       FROM analyses a
       JOIN crop_seasons cs ON cs.tenant_id = a.tenant_id AND cs.id = a.crop_season_id
       JOIN fields f ON f.tenant_id = cs.tenant_id AND f.id = cs.field_id
       JOIN properties p ON p.tenant_id = f.tenant_id AND p.id = f.property_id
       WHERE a.tenant_id = $1::uuid AND p.client_id = $2::uuid
       ORDER BY a.created_at DESC, a.id`, [tenantId, clientId],
    );
    const reports = await client.query<{
      id: string; analysisId: string; analysisCode: string; revision: number; publishedAt: string;
    }>(
      `SELECT r.id::text, a.id::text AS "analysisId", a.code AS "analysisCode",
              r.revision, r.published_at::text AS "publishedAt"
       FROM reports r
       JOIN interpretations i ON i.tenant_id = r.tenant_id AND i.id = r.interpretation_id
       JOIN analyses a ON a.tenant_id = i.tenant_id AND a.id = i.analysis_id
       JOIN crop_seasons cs ON cs.tenant_id = a.tenant_id AND cs.id = a.crop_season_id
       JOIN fields f ON f.tenant_id = cs.tenant_id AND f.id = cs.field_id
       JOIN properties p ON p.tenant_id = f.tenant_id AND p.id = f.property_id
       WHERE r.tenant_id = $1::uuid AND p.client_id = $2::uuid
       ORDER BY r.published_at DESC, r.id`, [tenantId, clientId],
    );
    const history = await client.query<{ id: string; action: string; entityType: string; createdAt: string }>(
      `WITH client_properties AS (
         SELECT id FROM properties WHERE tenant_id = $1::uuid AND client_id = $2::uuid
       ), client_fields AS (
         SELECT f.id FROM fields f JOIN client_properties p ON p.id = f.property_id WHERE f.tenant_id = $1::uuid
       ), client_seasons AS (
         SELECT cs.id FROM crop_seasons cs JOIN client_fields f ON f.id = cs.field_id WHERE cs.tenant_id = $1::uuid
       ), client_analyses AS (
         SELECT a.id FROM analyses a JOIN client_seasons cs ON cs.id = a.crop_season_id WHERE a.tenant_id = $1::uuid
       ), client_interpretations AS (
         SELECT i.id FROM interpretations i JOIN client_analyses a ON a.id = i.analysis_id WHERE i.tenant_id = $1::uuid
       ), client_entities AS (
         SELECT 'client' AS entity_type, $2::uuid AS id
         UNION ALL SELECT 'property', id FROM client_properties
         UNION ALL SELECT 'field', id FROM client_fields
         UNION ALL SELECT 'crop_season', id FROM client_seasons
         UNION ALL SELECT 'analysis', id FROM client_analyses
         UNION ALL SELECT 'interpretation', id FROM client_interpretations
         UNION ALL SELECT 'report', r.id FROM reports r JOIN client_interpretations i ON i.id = r.interpretation_id WHERE r.tenant_id = $1::uuid
       )
       SELECT ae.id::text, ae.action, ae.entity_type AS "entityType", ae.created_at::text AS "createdAt"
       FROM audit_events ae
       JOIN client_entities e ON e.id = ae.entity_id AND e.entity_type = ae.entity_type
       WHERE ae.tenant_id = $1::uuid ORDER BY ae.created_at DESC, ae.id DESC LIMIT 50`, [tenantId, clientId],
    );

    return {
      client: item,
      seasons: seasons.rows,
      analyses: analyses.rows,
      reports: reports.rows,
      history: history.rows,
      properties: properties.rows.map((property) => ({
        ...property,
        fields: fields.rows.filter((field) => field.propertyId === property.id),
      })),
    };
  });
}

export async function createClient(input: {
  tenantId: string;
  userId: string;
  name: string;
  taxId?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  postalCode?: string | null;
  street?: string | null;
  addressNumber?: string | null;
  addressComplement?: string | null;
  district?: string | null;
  municipality?: string | null;
  state?: string | null;
  country?: string | null;
  notes?: string | null;
  personType: "PF" | "PJ";
  documentNormalized?: string | null;
  tradeName?: string | null;
  contactName?: string | null;
}) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    let result;
    try {
      result = await client.query<ClientListItem>(
      `INSERT INTO clients (
         tenant_id, name, tax_id, document_normalized, person_type, trade_name, contact_name,
         email, phone, whatsapp, postal_code, street, address_number, address_complement,
         district, municipality, state, country, notes
       )
       VALUES (
         $1::uuid, $2, nullif($3,''), nullif($4,''), $5, nullif($6,''), nullif($7,''),
         nullif($8,'')::citext, nullif($9,''), nullif($10,''), nullif($11,''), nullif($12,''),
         nullif($13,''), nullif($14,''), nullif($15,''), nullif($16,''), nullif($17,''), nullif($18,''), nullif($19,'')
       )
       RETURNING id::text AS id, name, tax_id AS "taxId", email::text AS email, phone, whatsapp,
                 postal_code AS "postalCode", street, address_number AS "addressNumber",
                 address_complement AS "addressComplement", district, municipality, state, country,
                 person_type AS "personType", trade_name AS "tradeName", contact_name AS "contactName", notes,
                 archived_at::text AS "archivedAt",
                 0::int AS properties, 0::float8 AS hectares, 0::int AS analyses,
                 created_at::text AS "createdAt"`,
      [
        input.tenantId, input.name.trim(), input.taxId ?? "", input.documentNormalized ?? "", input.personType,
        input.tradeName ?? "", input.contactName ?? "", input.email?.trim().toLowerCase() ?? "", input.phone ?? "",
        input.whatsapp ?? "", input.postalCode ?? "", input.street ?? "", input.addressNumber ?? "",
        input.addressComplement ?? "", input.district ?? "", input.municipality ?? "", input.state ?? "",
        input.country ?? "BR", input.notes ?? ""
      ],
      );
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "23505") {
        throw new ClientError("Já existe um cliente com este CPF/CNPJ nesta empresa.", 409);
      }
      throw error;
    }
    const created = result.rows[0];
    await writeAudit(client, {
      tenantId: input.tenantId,
      userId: input.userId,
      action: "CLIENT_CREATED",
      entityType: "client",
      entityId: created.id,
      metadata: { personType: created.personType, hasDocument: Boolean(input.documentNormalized) },
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
  whatsapp?: string | null;
  postalCode?: string | null;
  street?: string | null;
  addressNumber?: string | null;
  addressComplement?: string | null;
  district?: string | null;
  municipality?: string | null;
  state?: string | null;
  country?: string | null;
  notes?: string | null;
  personType: "PF" | "PJ";
  documentNormalized?: string | null;
  tradeName?: string | null;
  contactName?: string | null;
}) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    let result;
    try {
      result = await client.query<ClientListItem>(
      `UPDATE clients
       SET name = $3,
           tax_id = nullif($4,''),
           document_normalized = nullif($5,''),
           person_type = $6,
           trade_name = nullif($7,''),
           contact_name = nullif($8,''),
           email = nullif($9,'')::citext,
           phone = nullif($10,''),
           whatsapp = nullif($11,''),
           postal_code = nullif($12,''),
           street = nullif($13,''),
           address_number = nullif($14,''),
           address_complement = nullif($15,''),
           district = nullif($16,''),
           municipality = nullif($17,''),
           state = nullif($18,''),
           country = nullif($19,''),
           notes = nullif($20,''),
           updated_at = now()
       WHERE tenant_id = $1::uuid AND id = $2::uuid
       RETURNING id::text AS id, name, tax_id AS "taxId", email::text AS email, phone, whatsapp,
                 postal_code AS "postalCode", street, address_number AS "addressNumber",
                 address_complement AS "addressComplement", district, municipality, state, country,
                 person_type AS "personType", trade_name AS "tradeName", contact_name AS "contactName", notes,
                 archived_at::text AS "archivedAt",
                 (SELECT count(*)::int FROM properties p WHERE p.tenant_id = clients.tenant_id AND p.client_id = clients.id) AS properties,
                 (SELECT coalesce(sum(f.area_ha),0)::float8 FROM properties p JOIN fields f ON f.tenant_id = p.tenant_id AND f.property_id = p.id WHERE p.tenant_id = clients.tenant_id AND p.client_id = clients.id) AS hectares,
                 (SELECT count(*)::int FROM properties p JOIN fields f ON f.tenant_id = p.tenant_id AND f.property_id = p.id JOIN crop_seasons cs ON cs.tenant_id = f.tenant_id AND cs.field_id = f.id JOIN analyses a ON a.tenant_id = cs.tenant_id AND a.crop_season_id = cs.id WHERE p.tenant_id = clients.tenant_id AND p.client_id = clients.id) AS analyses,
                 created_at::text AS "createdAt"`,
      [
        input.tenantId, input.clientId, input.name.trim(), input.taxId ?? "", input.documentNormalized ?? "", input.personType,
        input.tradeName ?? "", input.contactName ?? "", input.email?.trim().toLowerCase() ?? "", input.phone ?? "",
        input.whatsapp ?? "", input.postalCode ?? "", input.street ?? "", input.addressNumber ?? "",
        input.addressComplement ?? "", input.district ?? "", input.municipality ?? "", input.state ?? "",
        input.country ?? "", input.notes ?? ""
      ],
      );
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "23505") {
        throw new ClientError("Já existe um cliente com este CPF/CNPJ nesta empresa.", 409);
      }
      throw error;
    }
    const updated = result.rows[0];
    if (!updated) throw new ClientError("Cliente não encontrado.", 404);
    await writeAudit(client, {
      tenantId: input.tenantId,
      userId: input.userId,
      action: "CLIENT_UPDATED",
      entityType: "client",
      entityId: updated.id,
      metadata: { personType: updated.personType, hasDocument: Boolean(input.documentNormalized) },
    });
    return updated;
  });
}

export async function archiveClient(input: { tenantId: string; userId: string; clientId: string; reason?: string | null }) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    let result;
    try {
      result = await client.query<{ id: string; name: string }>(
        `UPDATE clients SET archived_at = now(), archived_by = $3::uuid, archive_reason = nullif($4,''), updated_at = now()
         WHERE tenant_id = $1::uuid AND id = $2::uuid AND archived_at IS NULL RETURNING id::text, name`,
        [input.tenantId, input.clientId, input.userId, input.reason ?? ""],
      );
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "23503") {
        throw new ClientError("Não foi possível arquivar este cliente.", 409);
      }
      throw error;
    }
    const deleted = result.rows[0];
    if (!deleted) throw new ClientError("Cliente não encontrado.", 404);
    await writeAudit(client, {
      tenantId: input.tenantId,
      userId: input.userId,
      action: "CLIENT_ARCHIVED",
      entityType: "client",
      entityId: deleted.id,
      metadata: { reasonProvided: Boolean(input.reason) },
    });
    return deleted;
  });
}
