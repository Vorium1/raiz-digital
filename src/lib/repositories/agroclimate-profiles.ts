import { withTenant } from "@/lib/db";
import { writeAudit } from "@/lib/repositories/audit";
import { adaptAgroclimateCatalogRows, type ActiveAgroclimateCatalogRow } from "@/domain/agroclimate-profile-adapter";

export type AgroclimateProfileKind =
  | "PHYSIOLOGY"
  | "REGIONAL_CLIMATE"
  | "DISEASE"
  | "ZARC_CONTEXT";

export class AgroclimateProfileError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = "AgroclimateProfileError";
  }
}

const PROFILE_KINDS = new Set<AgroclimateProfileKind>([
  "PHYSIOLOGY",
  "REGIONAL_CLIMATE",
  "DISEASE",
  "ZARC_CONTEXT",
]);

function normalizeCode(value: string) {
  return value.trim().toUpperCase();
}

function normalizeStages(values: string[] | undefined) {
  return [...new Set((values ?? []).map(normalizeCode).filter(Boolean))];
}

export async function listAgroclimateProfiles(input: {
  tenantId: string;
  userId?: string;
  cropCode?: string | null;
  technicalRegionCodes?: string[];
  status?: "DRAFT" | "ACTIVE" | "SUPERSEDED" | null;
}) {
  const regionCodes = [...new Set((input.technicalRegionCodes ?? []).map(normalizeCode).filter(Boolean))];

  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const result = await client.query(
      `SELECT ap.id::text,
              ap.code,
              ap.semantic_version AS "semanticVersion",
              ap.kind::text,
              ap.status::text,
              ap.disease_code AS "diseaseCode",
              ap.phenological_stages AS "phenologicalStages",
              ap.payload,
              ap.content_hash AS "contentHash",
              ap.technical_region_code AS "technicalRegionCode",
              ap.technical_source_id::text AS "technicalSourceId",
              ap.valid_from::text AS "validFrom",
              ap.valid_until::text AS "validUntil",
              ap.created_at::text AS "createdAt",
              ap.updated_at::text AS "updatedAt",
              cp.id::text AS "cropProfileId",
              cp.code AS "cropCode",
              cp.name AS "cropName",
              tr.name AS "technicalRegionName",
              tr.country_code AS "countryCode",
              tr.state_codes AS "stateCodes",
              tr.municipality_codes AS "municipalityCodes",
              tr.climate_zone_code AS "climateZoneCode",
              ts.title AS "technicalSourceTitle",
              ts.institution AS "technicalSourceInstitution",
              ts.status::text AS "technicalSourceStatus"
       FROM agroclimate_profiles ap
       JOIN crop_profiles cp ON cp.id = ap.crop_profile_id
       JOIN technical_regions tr ON tr.code = ap.technical_region_code
       LEFT JOIN technical_sources ts ON ts.id = ap.technical_source_id
       WHERE ($1::text IS NULL OR cp.code = $1)
         AND ($2::text[] IS NULL OR ap.technical_region_code = ANY($2::text[]))
         AND ($3::text IS NULL OR ap.status::text = $3)
       ORDER BY cp.code, ap.kind, ap.technical_region_code, ap.code, ap.semantic_version`,
      [
        input.cropCode ? normalizeCode(input.cropCode) : null,
        regionCodes.length ? regionCodes : null,
        input.status ?? null,
      ],
    );
    return result.rows;
  });
}

export async function listActiveAgroclimateProfilesForContext(input: {
  tenantId: string;
  userId?: string;
  cropCode: string;
  technicalRegionCodes: string[];
  atDate?: string | null;
}) {
  const regionCodes = [...new Set(input.technicalRegionCodes.map(normalizeCode).filter(Boolean))];
  if (!regionCodes.length) {
    throw new AgroclimateProfileError("Região técnica resolvida é obrigatória para carregar perfis agroclimáticos.", 422);
  }

  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const result = await client.query(
      `SELECT ap.id::text,
              ap.code,
              ap.semantic_version AS "semanticVersion",
              ap.kind::text,
              ap.disease_code AS "diseaseCode",
              ap.phenological_stages AS "phenologicalStages",
              ap.payload,
              ap.content_hash AS "contentHash",
              ap.technical_region_code AS "technicalRegionCode",
              ap.technical_source_id::text AS "technicalSourceId",
              cp.code AS "cropCode",
              tr.name AS "technicalRegionName",
              tr.country_code AS "countryCode",
              tr.state_codes AS "stateCodes",
              tr.municipality_codes AS "municipalityCodes",
              tr.climate_zone_code AS "climateZoneCode",
              ts.title AS "technicalSourceTitle",
              ts.institution AS "technicalSourceInstitution"
       FROM agroclimate_profiles ap
       JOIN crop_profiles cp ON cp.id = ap.crop_profile_id
       JOIN technical_regions tr ON tr.code = ap.technical_region_code
       JOIN technical_sources ts ON ts.id = ap.technical_source_id
       WHERE cp.code = $1
         AND ap.technical_region_code = ANY($2::text[])
         AND ap.status = 'ACTIVE'
         AND ts.status = 'ACTIVE'
         AND (ap.valid_from IS NULL OR ap.valid_from <= COALESCE($3::date, CURRENT_DATE))
         AND (ap.valid_until IS NULL OR ap.valid_until >= COALESCE($3::date, CURRENT_DATE))
       ORDER BY
         CASE
           WHEN tr.boundary IS NOT NULL THEN 400
           WHEN cardinality(tr.municipality_codes) > 0 THEN 300
           WHEN cardinality(tr.state_codes) > 0 THEN 200
           ELSE 100
         END DESC,
         ap.kind,
         ap.code`,
      [normalizeCode(input.cropCode), regionCodes, input.atDate ?? null],
    );
    return result.rows;
  });
}

export async function createAgroclimateProfile(input: {
  tenantId: string;
  userId: string;
  code: string;
  semanticVersion?: string;
  kind: AgroclimateProfileKind;
  cropProfileId: string;
  technicalRegionCode: string;
  technicalSourceId: string;
  diseaseCode?: string | null;
  phenologicalStages?: string[];
  payload: Record<string, unknown>;
  contentHash?: string | null;
  validFrom?: string | null;
  validUntil?: string | null;
}) {
  if (!PROFILE_KINDS.has(input.kind)) {
    throw new AgroclimateProfileError("Tipo de perfil agroclimático inválido.", 400);
  }
  if (input.kind === "DISEASE" && !input.diseaseCode?.trim()) {
    throw new AgroclimateProfileError("Perfil de doença exige diseaseCode.", 400);
  }
  if (!input.technicalSourceId.trim()) {
    throw new AgroclimateProfileError("Fonte técnica é obrigatória.", 400);
  }

  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const region = await client.query(
      `SELECT code FROM technical_regions WHERE code = $1 LIMIT 1`,
      [normalizeCode(input.technicalRegionCode)],
    );
    if (!region.rows[0]) throw new AgroclimateProfileError("Região técnica não encontrada.", 404);

    const source = await client.query(
      `SELECT id::text, status::text FROM technical_sources WHERE id = $1::uuid LIMIT 1`,
      [input.technicalSourceId],
    );
    if (!source.rows[0]) throw new AgroclimateProfileError("Fonte técnica não encontrada.", 404);

    const result = await client.query(
      `INSERT INTO agroclimate_profiles
       (code, semantic_version, kind, crop_profile_id, technical_region_code,
        technical_source_id, disease_code, phenological_stages, payload,
        content_hash, valid_from, valid_until, authored_by)
       VALUES (
         $1, $2, $3::agroclimate_profile_kind, $4::uuid, $5,
         $6::uuid, nullif($7,''), $8::text[], $9::jsonb,
         nullif($10,''), $11::date, $12::date, $13::uuid
       )
       RETURNING id::text, code, semantic_version AS "semanticVersion",
                 kind::text, status::text, technical_region_code AS "technicalRegionCode"`,
      [
        normalizeCode(input.code),
        input.semanticVersion?.trim() || "0.1.0",
        input.kind,
        input.cropProfileId,
        normalizeCode(input.technicalRegionCode),
        input.technicalSourceId,
        input.diseaseCode ? normalizeCode(input.diseaseCode) : "",
        normalizeStages(input.phenologicalStages),
        JSON.stringify(input.payload ?? {}),
        input.contentHash ?? "",
        input.validFrom ?? null,
        input.validUntil ?? null,
        input.userId,
      ],
    );

    const created = result.rows[0];
    await writeAudit(client, {
      tenantId: input.tenantId,
      userId: input.userId,
      action: "AGROCLIMATE_PROFILE_CREATED",
      entityType: "agroclimate_profile",
      entityId: created.id,
      metadata: {
        code: created.code,
        kind: input.kind,
        cropProfileId: input.cropProfileId,
        technicalRegionCode: created.technicalRegionCode,
        technicalSourceId: input.technicalSourceId,
      },
    });
    return created;
  });
}

export async function setAgroclimateProfileStatus(input: {
  tenantId: string;
  userId: string;
  profileId: string;
  status: "DRAFT" | "ACTIVE" | "SUPERSEDED";
}) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const current = await client.query(
      `SELECT ap.id::text,
              ap.code,
              ap.semantic_version AS "semanticVersion",
              ap.kind::text,
              ap.disease_code AS "diseaseCode",
              ap.phenological_stages AS "phenologicalStages",
              ap.payload,
              ap.technical_region_code AS "technicalRegionCode",
              ap.technical_source_id::text AS "technicalSourceId",
              cp.code AS "cropCode",
              tr.name AS "technicalRegionName",
              tr.country_code AS "countryCode",
              tr.state_codes AS "stateCodes",
              tr.municipality_codes AS "municipalityCodes",
              tr.climate_zone_code AS "climateZoneCode",
              ts.title AS "technicalSourceTitle",
              ts.institution AS "technicalSourceInstitution",
              ts.status::text AS "technicalSourceStatus"
       FROM agroclimate_profiles ap
       JOIN crop_profiles cp ON cp.id = ap.crop_profile_id
       JOIN technical_regions tr ON tr.code = ap.technical_region_code
       LEFT JOIN technical_sources ts ON ts.id = ap.technical_source_id
       WHERE ap.id = $1::uuid
       FOR UPDATE OF ap`,
      [input.profileId],
    );
    const row = current.rows[0];
    if (!row) throw new AgroclimateProfileError("Perfil agroclimático não encontrado.", 404);

    if (input.status === "ACTIVE") {
      if (!row.technicalSourceId) {
        throw new AgroclimateProfileError("Perfil não pode ser homologado sem fonte técnica.", 422);
      }
      if (row.technicalSourceStatus !== "ACTIVE") {
        throw new AgroclimateProfileError("A fonte técnica precisa estar ACTIVE antes da homologação do perfil.", 422);
      }

      const adapted = adaptAgroclimateCatalogRows([row as ActiveAgroclimateCatalogRow]);
      if (adapted.rejected.length > 0) {
        throw new AgroclimateProfileError(
          `Payload agroclimático inválido para homologação: ${adapted.rejected[0].reason}.`,
          422,
        );
      }
    }

    const result = await client.query(
      `UPDATE agroclimate_profiles
       SET status = $2::crop_profile_status,
           approved_by = CASE WHEN $2 = 'ACTIVE' THEN $3::uuid ELSE approved_by END,
           updated_at = now()
       WHERE id = $1::uuid
       RETURNING id::text, code, kind::text, status::text,
                 technical_region_code AS "technicalRegionCode"`,
      [input.profileId, input.status, input.userId],
    );
    const updated = result.rows[0];

    await writeAudit(client, {
      tenantId: input.tenantId,
      userId: input.userId,
      action: "AGROCLIMATE_PROFILE_STATUS_CHANGED",
      entityType: "agroclimate_profile",
      entityId: updated.id,
      metadata: {
        status: input.status,
        code: updated.code,
        technicalRegionCode: updated.technicalRegionCode,
      },
    });
    return updated;
  });
}
