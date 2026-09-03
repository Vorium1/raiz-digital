import { withTenant } from "@/lib/db";
import { writeAudit } from "@/lib/repositories/audit";

export class CatalogError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = "CatalogError";
  }
}

function isForeignKeyViolation(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "23503");
}

export async function listAgronomicContext(tenantId: string, userId?: string) {
  return withTenant({ tenantId, userId }, async (client) => {
    const [clients, properties, fields, seasons, laboratories, cropProfiles, technicalRegions] = await Promise.all([
      client.query(`SELECT id::text, name FROM clients ORDER BY name`),
      client.query(`SELECT id::text, client_id::text AS "clientId", name, municipality, state, CASE WHEN boundary IS NULL THEN NULL ELSE ST_AsGeoJSON(boundary)::json END AS boundary FROM properties ORDER BY name`),
      client.query(`SELECT id::text, property_id::text AS "propertyId", name, area_ha::float8 AS "areaHa", ST_AsGeoJSON(boundary)::json AS boundary FROM fields ORDER BY name`),
      client.query(
        `SELECT id::text, field_id::text AS "fieldId", season_label AS "seasonLabel", current_crop AS "currentCrop", next_crop AS "nextCrop",
                yield_goal::float8 AS "yieldGoal", yield_goal_unit AS "yieldGoalUnit", irrigated,
                crop_profile_id::text AS "cropProfileId", cultivar, management_system AS "managementSystem",
                soil_type AS "soilType", soil_texture AS "soilTexture", technical_region_code AS "technicalRegionCode",
                next_cultivar AS "nextCultivar", technology_level AS "technologyLevel", soil_compaction_level AS "soilCompactionLevel",
                livestock_trample_area_ha::float8 AS "livestockTrampleAreaHa", headland_area_ha::float8 AS "headlandAreaHa",
                is_first_year_area AS "isFirstYearArea", cultivation_years AS "cultivationYears"
         FROM crop_seasons ORDER BY created_at DESC`,
      ),
      client.query(`SELECT id::text, name, tax_id AS "taxId" FROM laboratories WHERE active ORDER BY name`),
      client.query(`SELECT id::text, code, name, status FROM crop_profiles ORDER BY name`),
      client.query(`SELECT id::text, code, name FROM technical_regions ORDER BY name`),
    ]);
    return {
      clients: clients.rows,
      properties: properties.rows,
      fields: fields.rows,
      seasons: seasons.rows,
      laboratories: laboratories.rows,
      cropProfiles: cropProfiles.rows,
      technicalRegions: technicalRegions.rows,
    };
  });
}

export async function listAllLaboratories(tenantId: string, userId?: string) {
  return withTenant({ tenantId, userId }, async (client) => {
    const result = await client.query(`SELECT id::text, name, tax_id AS "taxId", active FROM laboratories ORDER BY active DESC, name`);
    return result.rows;
  });
}

export async function createLaboratory(input: { tenantId: string; userId: string; name: string; taxId?: string | null }) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const result = await client.query(
      `INSERT INTO laboratories (tenant_id, name, tax_id) VALUES ($1::uuid, $2, nullif($3,''))
       RETURNING id::text, name, tax_id AS "taxId", active`,
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

export async function updateLaboratory(input: { tenantId: string; userId: string; laboratoryId: string; name: string; taxId?: string | null }) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const result = await client.query(
      `UPDATE laboratories SET name = $3, tax_id = nullif($4,'')
       WHERE tenant_id = $1::uuid AND id = $2::uuid
       RETURNING id::text, name, tax_id AS "taxId", active`,
      [input.tenantId, input.laboratoryId, input.name, input.taxId ?? ""],
    );
    const updated = result.rows[0];
    if (!updated) throw new CatalogError("Laboratório não encontrado.", 404);
    await writeAudit(client, { tenantId: input.tenantId, userId: input.userId, action: "LABORATORY_UPDATED", entityType: "laboratory", entityId: updated.id, metadata: { name: updated.name } });
    return updated;
  });
}

export async function setLaboratoryActive(input: { tenantId: string; userId: string; laboratoryId: string; active: boolean }) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const result = await client.query(
      `UPDATE laboratories SET active = $3 WHERE tenant_id = $1::uuid AND id = $2::uuid RETURNING id::text, name, tax_id AS "taxId", active`,
      [input.tenantId, input.laboratoryId, input.active],
    );
    const updated = result.rows[0];
    if (!updated) throw new CatalogError("Laboratório não encontrado.", 404);
    await writeAudit(client, { tenantId: input.tenantId, userId: input.userId, action: input.active ? "LABORATORY_REACTIVATED" : "LABORATORY_DEACTIVATED", entityType: "laboratory", entityId: updated.id, metadata: { name: updated.name } });
    return updated;
  });
}

export async function updateProperty(input: { tenantId: string; userId: string; propertyId: string; name: string; municipality: string; state: string }) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const result = await client.query(
      `UPDATE properties SET name = $3, municipality = $4, state = $5
       WHERE tenant_id = $1::uuid AND id = $2::uuid
       RETURNING id::text, client_id::text AS "clientId", name, municipality, state`,
      [input.tenantId, input.propertyId, input.name, input.municipality, input.state],
    );
    const updated = result.rows[0];
    if (!updated) throw new CatalogError("Propriedade não encontrada.", 404);
    await writeAudit(client, { tenantId: input.tenantId, userId: input.userId, action: "PROPERTY_UPDATED", entityType: "property", entityId: updated.id, metadata: { name: updated.name } });
    return updated;
  });
}

export async function deleteProperty(input: { tenantId: string; userId: string; propertyId: string }) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    let result;
    try {
      result = await client.query<{ id: string; name: string }>(
        `DELETE FROM properties WHERE tenant_id = $1::uuid AND id = $2::uuid RETURNING id::text, name`,
        [input.tenantId, input.propertyId],
      );
    } catch (error) {
      if (isForeignKeyViolation(error)) throw new CatalogError("Não é possível excluir: esta propriedade já tem talhões cadastrados.", 409);
      throw error;
    }
    const deleted = result.rows[0];
    if (!deleted) throw new CatalogError("Propriedade não encontrada.", 404);
    await writeAudit(client, { tenantId: input.tenantId, userId: input.userId, action: "PROPERTY_DELETED", entityType: "property", entityId: deleted.id, metadata: { name: deleted.name } });
    return deleted;
  });
}

export async function updateField(input: { tenantId: string; userId: string; fieldId: string; name: string }) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const result = await client.query(
      `UPDATE fields SET name = $3
       WHERE tenant_id = $1::uuid AND id = $2::uuid
       RETURNING id::text, property_id::text AS "propertyId", name, area_ha::float8 AS "areaHa", ST_AsGeoJSON(boundary)::json AS boundary`,
      [input.tenantId, input.fieldId, input.name],
    );
    const updated = result.rows[0];
    if (!updated) throw new CatalogError("Talhão não encontrado.", 404);
    await writeAudit(client, { tenantId: input.tenantId, userId: input.userId, action: "FIELD_UPDATED", entityType: "field", entityId: updated.id, metadata: { name: updated.name } });
    return updated;
  });
}

export async function deleteField(input: { tenantId: string; userId: string; fieldId: string }) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    let result;
    try {
      result = await client.query<{ id: string; name: string }>(
        `DELETE FROM fields WHERE tenant_id = $1::uuid AND id = $2::uuid RETURNING id::text, name`,
        [input.tenantId, input.fieldId],
      );
    } catch (error) {
      if (isForeignKeyViolation(error)) throw new CatalogError("Não é possível excluir: este talhão já tem safras ou coletas cadastradas.", 409);
      throw error;
    }
    const deleted = result.rows[0];
    if (!deleted) throw new CatalogError("Talhão não encontrado.", 404);
    await writeAudit(client, { tenantId: input.tenantId, userId: input.userId, action: "FIELD_DELETED", entityType: "field", entityId: deleted.id, metadata: { name: deleted.name } });
    return deleted;
  });
}

export async function updateCropSeason(input: {
  tenantId: string;
  userId: string;
  cropSeasonId: string;
  seasonLabel: string;
  currentCrop?: string | null;
  nextCrop?: string | null;
  yieldGoal?: number | null;
  yieldGoalUnit?: string | null;
  irrigated?: boolean;
  cropProfileId?: string | null;
  cultivar?: string | null;
  managementSystem?: string | null;
  soilType?: string | null;
  soilTexture?: string | null;
  technicalRegionCode?: string | null;
  nextCultivar?: string | null;
  technologyLevel?: string | null;
  soilCompactionLevel?: string | null;
  livestockTrampleAreaHa?: number | null;
  headlandAreaHa?: number | null;
  isFirstYearArea?: boolean | null;
  cultivationYears?: number | null;
}) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const result = await client.query(
      `UPDATE crop_seasons
       SET season_label = $3, current_crop = nullif($4,''), next_crop = nullif($5,''), yield_goal = $6, yield_goal_unit = nullif($7,''), irrigated = $8,
           crop_profile_id = $9::uuid, cultivar = nullif($10,''), management_system = nullif($11,''),
           soil_type = nullif($12,''), soil_texture = nullif($13,''), technical_region_code = nullif($14,''),
           next_cultivar = nullif($15,''), technology_level = nullif($16,''), soil_compaction_level = nullif($17,''),
           livestock_trample_area_ha = $18, headland_area_ha = $19, is_first_year_area = $20, cultivation_years = $21
       WHERE tenant_id = $1::uuid AND id = $2::uuid
       RETURNING id::text, field_id::text AS "fieldId", season_label AS "seasonLabel", current_crop AS "currentCrop", next_crop AS "nextCrop",
                 yield_goal::float8 AS "yieldGoal", yield_goal_unit AS "yieldGoalUnit", irrigated,
                 crop_profile_id::text AS "cropProfileId", cultivar, management_system AS "managementSystem",
                 soil_type AS "soilType", soil_texture AS "soilTexture", technical_region_code AS "technicalRegionCode",
                 next_cultivar AS "nextCultivar", technology_level AS "technologyLevel", soil_compaction_level AS "soilCompactionLevel",
                 livestock_trample_area_ha::float8 AS "livestockTrampleAreaHa", headland_area_ha::float8 AS "headlandAreaHa",
                 is_first_year_area AS "isFirstYearArea", cultivation_years AS "cultivationYears"`,
      [
        input.tenantId, input.cropSeasonId, input.seasonLabel, input.currentCrop ?? "", input.nextCrop ?? "",
        input.yieldGoal ?? null, input.yieldGoalUnit ?? "", input.irrigated ?? false,
        input.cropProfileId ?? null, input.cultivar ?? "", input.managementSystem ?? "",
        input.soilType ?? "", input.soilTexture ?? "", input.technicalRegionCode ?? "",
        input.nextCultivar ?? "", input.technologyLevel ?? "", input.soilCompactionLevel ?? "",
        input.livestockTrampleAreaHa ?? null, input.headlandAreaHa ?? null,
        input.isFirstYearArea ?? null, input.cultivationYears ?? null,
      ],
    );
    const updated = result.rows[0];
    if (!updated) throw new CatalogError("Safra não encontrada.", 404);
    await writeAudit(client, { tenantId: input.tenantId, userId: input.userId, action: "CROP_SEASON_UPDATED", entityType: "crop_season", entityId: updated.id, metadata: { seasonLabel: updated.seasonLabel } });
    return updated;
  });
}

export async function deleteCropSeason(input: { tenantId: string; userId: string; cropSeasonId: string }) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    let result;
    try {
      result = await client.query<{ id: string; seasonLabel: string }>(
        `DELETE FROM crop_seasons WHERE tenant_id = $1::uuid AND id = $2::uuid RETURNING id::text, season_label AS "seasonLabel"`,
        [input.tenantId, input.cropSeasonId],
      );
    } catch (error) {
      if (isForeignKeyViolation(error)) throw new CatalogError("Não é possível excluir: esta safra já tem ordens de coleta ou análises cadastradas.", 409);
      throw error;
    }
    const deleted = result.rows[0];
    if (!deleted) throw new CatalogError("Safra não encontrada.", 404);
    await writeAudit(client, { tenantId: input.tenantId, userId: input.userId, action: "CROP_SEASON_DELETED", entityType: "crop_season", entityId: deleted.id, metadata: { seasonLabel: deleted.seasonLabel } });
    return deleted;
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
  cropProfileId?: string | null;
  cultivar?: string | null;
  managementSystem?: string | null;
  soilType?: string | null;
  soilTexture?: string | null;
  technicalRegionCode?: string | null;
  nextCultivar?: string | null;
  technologyLevel?: string | null;
  soilCompactionLevel?: string | null;
  livestockTrampleAreaHa?: number | null;
  headlandAreaHa?: number | null;
  isFirstYearArea?: boolean | null;
  cultivationYears?: number | null;
}) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const result = await client.query(
      `INSERT INTO crop_seasons
       (tenant_id, field_id, season_label, current_crop, next_crop, yield_goal, yield_goal_unit, irrigated,
        crop_profile_id, cultivar, management_system, soil_type, soil_texture, technical_region_code,
        next_cultivar, technology_level, soil_compaction_level, livestock_trample_area_ha, headland_area_ha,
        is_first_year_area, cultivation_years)
       VALUES ($1::uuid, $2::uuid, $3, nullif($4,''), nullif($5,''), $6, nullif($7,''), $8,
               $9::uuid, nullif($10,''), nullif($11,''), nullif($12,''), nullif($13,''), nullif($14,''),
               nullif($15,''), nullif($16,''), nullif($17,''), $18, $19, $20, $21)
       RETURNING id::text, field_id::text AS "fieldId", season_label AS "seasonLabel", current_crop AS "currentCrop", next_crop AS "nextCrop",
                 yield_goal::float8 AS "yieldGoal", yield_goal_unit AS "yieldGoalUnit", irrigated,
                 crop_profile_id::text AS "cropProfileId", cultivar, management_system AS "managementSystem",
                 soil_type AS "soilType", soil_texture AS "soilTexture", technical_region_code AS "technicalRegionCode",
                 next_cultivar AS "nextCultivar", technology_level AS "technologyLevel", soil_compaction_level AS "soilCompactionLevel",
                 livestock_trample_area_ha::float8 AS "livestockTrampleAreaHa", headland_area_ha::float8 AS "headlandAreaHa",
                 is_first_year_area AS "isFirstYearArea", cultivation_years AS "cultivationYears"`,
      [
        input.tenantId, input.fieldId, input.seasonLabel, input.currentCrop ?? "", input.nextCrop ?? "",
        input.yieldGoal ?? null, input.yieldGoalUnit ?? "", input.irrigated ?? false,
        input.cropProfileId ?? null, input.cultivar ?? "", input.managementSystem ?? "",
        input.soilType ?? "", input.soilTexture ?? "", input.technicalRegionCode ?? "",
        input.nextCultivar ?? "", input.technologyLevel ?? "", input.soilCompactionLevel ?? "",
        input.livestockTrampleAreaHa ?? null, input.headlandAreaHa ?? null,
        input.isFirstYearArea ?? null, input.cultivationYears ?? null,
      ],
    );
    const created = result.rows[0];
    await writeAudit(client, { tenantId: input.tenantId, userId: input.userId, action: "CROP_SEASON_CREATED", entityType: "crop_season", entityId: created.id, metadata: { seasonLabel: created.seasonLabel } });
    return created;
  });
}

export async function listFieldYieldHistory(tenantId: string, fieldId: string, userId?: string) {
  return withTenant({ tenantId, userId }, async (client) => {
    const result = await client.query(
      `SELECT id::text, field_id::text AS "fieldId", season_label AS "seasonLabel", crop, cultivar,
              yield_value::float8 AS "yieldValue", yield_unit AS "yieldUnit", source, created_at AS "createdAt"
       FROM field_yield_history WHERE tenant_id = $1::uuid AND field_id = $2::uuid ORDER BY created_at DESC`,
      [tenantId, fieldId],
    );
    return result.rows;
  });
}

export async function createFieldYieldHistory(input: {
  tenantId: string;
  userId: string;
  fieldId: string;
  seasonLabel: string;
  crop: string;
  cultivar?: string | null;
  yieldValue: number;
  yieldUnit: string;
  source?: string | null;
}) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    let result;
    try {
      result = await client.query(
        `INSERT INTO field_yield_history (tenant_id, field_id, season_label, crop, cultivar, yield_value, yield_unit, source, created_by)
         VALUES ($1::uuid, $2::uuid, $3, $4, nullif($5,''), $6, $7, nullif($8,''), $9::uuid)
         RETURNING id::text, field_id::text AS "fieldId", season_label AS "seasonLabel", crop, cultivar,
                   yield_value::float8 AS "yieldValue", yield_unit AS "yieldUnit", source, created_at AS "createdAt"`,
        [input.tenantId, input.fieldId, input.seasonLabel, input.crop, input.cultivar ?? "", input.yieldValue, input.yieldUnit, input.source ?? "", input.userId],
      );
    } catch (error) {
      if (isForeignKeyViolation(error)) throw new CatalogError("Talhão não encontrado.", 404);
      throw error;
    }
    const created = result.rows[0];
    await writeAudit(client, { tenantId: input.tenantId, userId: input.userId, action: "FIELD_YIELD_HISTORY_CREATED", entityType: "field_yield_history", entityId: created.id, metadata: { fieldId: created.fieldId, seasonLabel: created.seasonLabel, yieldValue: created.yieldValue } });
    return created;
  });
}

export async function deleteFieldYieldHistory(input: { tenantId: string; userId: string; entryId: string }) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const result = await client.query<{ id: string; seasonLabel: string }>(
      `DELETE FROM field_yield_history WHERE tenant_id = $1::uuid AND id = $2::uuid RETURNING id::text, season_label AS "seasonLabel"`,
      [input.tenantId, input.entryId],
    );
    const deleted = result.rows[0];
    if (!deleted) throw new CatalogError("Registro de produtividade não encontrado.", 404);
    await writeAudit(client, { tenantId: input.tenantId, userId: input.userId, action: "FIELD_YIELD_HISTORY_DELETED", entityType: "field_yield_history", entityId: deleted.id, metadata: { seasonLabel: deleted.seasonLabel } });
    return deleted;
  });
}
