import { withTenant } from "@/lib/db";
import { writeAudit } from "@/lib/repositories/audit";

export async function listAgronomicContext(tenantId: string, userId?: string) {
  return withTenant({ tenantId, userId }, async (client) => {
    const [clients, properties, fields, seasons, laboratories] = await Promise.all([
      client.query(`SELECT id::text, name FROM clients ORDER BY name`),
      client.query(`SELECT id::text, client_id::text AS "clientId", name, municipality, state, CASE WHEN boundary IS NULL THEN NULL ELSE ST_AsGeoJSON(boundary)::json END AS boundary FROM properties ORDER BY name`),
      client.query(`SELECT id::text, property_id::text AS "propertyId", name, area_ha::float8 AS "areaHa", ST_AsGeoJSON(boundary)::json AS boundary FROM fields ORDER BY name`),
      client.query(`SELECT id::text, field_id::text AS "fieldId", season_label AS "seasonLabel", current_crop AS "currentCrop", next_crop AS "nextCrop", yield_goal::float8 AS "yieldGoal", yield_goal_unit AS "yieldGoalUnit" FROM crop_seasons ORDER BY created_at DESC`),
      client.query(`SELECT id::text, name, tax_id AS "taxId" FROM laboratories WHERE active ORDER BY name`),
    ]);
    return { clients: clients.rows, properties: properties.rows, fields: fields.rows, seasons: seasons.rows, laboratories: laboratories.rows };
  });
}

export async function createLaboratory(input: { tenantId: string; userId: string; name: string; taxId?: string | null }) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const result = await client.query(
      `INSERT INTO laboratories (tenant_id, name, tax_id) VALUES ($1::uuid, $2, nullif($3,''))
       RETURNING id::text, name, tax_id AS "taxId"`,
      [input.tenantId, input.name, input.taxId ?? ""],
    );
    const created = result.rows[0];
    await writeAudit(client, { tenantId: input.tenantId, userId: input.userId, action: "LABORATORY_CREATED", entityType: "laboratory", entityId: created.id, metadata: { name: created.name } });
    return created;
  });
}

export async function createProperty(input: {
  tenantId: string;
  userId: string;
  clientId: string;
  name: string;
  municipality: string;
  state: string;
  boundary?: object | null;
}) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const result = await client.query(
      `INSERT INTO properties (tenant_id, client_id, name, municipality, state, boundary)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5,
         CASE WHEN $6::text IS NULL THEN NULL ELSE ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($6),4326)) END)
       RETURNING id::text, client_id::text AS "clientId", name, municipality, state`,
      [input.tenantId, input.clientId, input.name, input.municipality, input.state, input.boundary ? JSON.stringify(input.boundary) : null],
    );
    const created = result.rows[0];
    await writeAudit(client, { tenantId: input.tenantId, userId: input.userId, action: "PROPERTY_CREATED", entityType: "property", entityId: created.id, metadata: { name: created.name } });
    return created;
  });
}

export async function createField(input: {
  tenantId: string;
  userId: string;
  propertyId: string;
  name: string;
  boundary: object;
}) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const boundary = JSON.stringify(input.boundary);
    const result = await client.query(
      `WITH geom AS (
         SELECT ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($4),4326))::geometry(MultiPolygon,4326) AS boundary
       ), checked AS (
         SELECT g.boundary, p.boundary AS property_boundary, ST_IsValid(g.boundary) AS valid, ST_IsEmpty(g.boundary) AS empty
         FROM geom g
         JOIN properties p ON p.tenant_id = $1::uuid AND p.id = $2::uuid
       )
       INSERT INTO fields (tenant_id, property_id, name, area_ha, boundary)
       SELECT $1::uuid, $2::uuid, $3, (ST_Area(boundary::geography) / 10000.0)::numeric(12,4), boundary
       FROM checked
       WHERE valid AND NOT empty
         AND (property_boundary IS NULL OR ST_Covers(property_boundary, boundary))
       RETURNING id::text, property_id::text AS "propertyId", name, area_ha::float8 AS "areaHa", ST_AsGeoJSON(boundary)::json AS boundary`,
      [input.tenantId, input.propertyId, input.name, boundary],
    );
    const created = result.rows[0];
    if (!created || Number(created.areaHa) <= 0) throw new Error("Polígono inválido, vazio ou fora do limite cadastrado da propriedade.");
    await writeAudit(client, { tenantId: input.tenantId, userId: input.userId, action: "FIELD_CREATED", entityType: "field", entityId: created.id, metadata: { name: created.name, areaHa: created.areaHa } });
    return created;
  });
}

export async function createCropSeason(input: {
  tenantId: string;
  userId: string;
  fieldId: string;
  seasonLabel: string;
  currentCrop?: string | null;
  nextCrop?: string | null;
  yieldGoal?: number | null;
  yieldGoalUnit?: string | null;
  irrigated?: boolean;
}) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const result = await client.query(
      `INSERT INTO crop_seasons (tenant_id, field_id, season_label, current_crop, next_crop, yield_goal, yield_goal_unit, irrigated)
       VALUES ($1::uuid, $2::uuid, $3, nullif($4,''), nullif($5,''), $6, nullif($7,''), $8)
       RETURNING id::text, field_id::text AS "fieldId", season_label AS "seasonLabel", current_crop AS "currentCrop", next_crop AS "nextCrop", yield_goal::float8 AS "yieldGoal", yield_goal_unit AS "yieldGoalUnit", irrigated`,
      [input.tenantId, input.fieldId, input.seasonLabel, input.currentCrop ?? "", input.nextCrop ?? "", input.yieldGoal ?? null, input.yieldGoalUnit ?? "", input.irrigated ?? false],
    );
    const created = result.rows[0];
    await writeAudit(client, { tenantId: input.tenantId, userId: input.userId, action: "CROP_SEASON_CREATED", entityType: "crop_season", entityId: created.id, metadata: { seasonLabel: created.seasonLabel } });
    return created;
  });
}
