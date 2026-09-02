import { withTenant } from "@/lib/db";
import { writeAudit } from "@/lib/repositories/audit";

export class AgronomicProfileError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = "AgronomicProfileError";
  }
}

/**
 * Catálogo de culturas e regiões técnicas. crop_profiles/crop_profile_parameters
 * são referência técnica global (sem tenant_id), no mesmo padrão de rule_sets:
 * são conteúdo homologado por um agrônomo responsável, não dado operacional de
 * uma empresa. Continuamos usando withTenant apenas para reaproveitar a conexão
 * e registrar auditoria com o autor da ação — a leitura/escrita em si não é
 * filtrada por tenant porque a tabela não tem RLS habilitada.
 */

export async function listCropProfiles(tenantId: string, userId?: string) {
  return withTenant({ tenantId, userId }, async (client) => {
    const result = await client.query(
      `SELECT id::text, code, name, semantic_version AS "semanticVersion", status, crop_group AS "cropGroup",
              applicable_regions AS "applicableRegions", applicable_systems AS "applicableSystems",
              technical_notes AS "technicalNotes", created_at::text AS "createdAt"
       FROM crop_profiles ORDER BY crop_group NULLS LAST, name`,
    );
    return result.rows;
  });
}

export async function getCropProfile(tenantId: string, cropProfileId: string, userId?: string) {
  return withTenant({ tenantId, userId }, async (client) => {
    const profileResult = await client.query(
      `SELECT id::text, code, name, semantic_version AS "semanticVersion", content_hash AS "contentHash", status, crop_group AS "cropGroup",
              applicable_regions AS "applicableRegions", applicable_systems AS "applicableSystems",
              technical_notes AS "technicalNotes", authored_by::text AS "authoredBy", approved_by::text AS "approvedBy",
              created_at::text AS "createdAt", updated_at::text AS "updatedAt"
       FROM crop_profiles WHERE id = $1::uuid`,
      [cropProfileId],
    );
    const profile = profileResult.rows[0];
    if (!profile) return null;
    const parametersResult = await client.query(
      `SELECT id::text, parameter_code AS "parameterCode", parameter_category AS "parameterCategory",
              depth_from_cm::float8 AS "depthFromCm", depth_to_cm::float8 AS "depthToCm",
              analytical_method_allowed AS "analyticalMethodAllowed", unit_expected AS "unitExpected",
              sufficiency_ranges AS "sufficiencyRanges", criticality, yield_goal_bracket AS "yieldGoalBracket",
              technical_notes AS "technicalNotes", recommendation_rules AS "recommendationRules", status,
              created_at::text AS "createdAt", updated_at::text AS "updatedAt"
       FROM crop_profile_parameters WHERE crop_profile_id = $1::uuid ORDER BY parameter_code, depth_from_cm NULLS FIRST`,
      [cropProfileId],
    );
    return { ...profile, parameters: parametersResult.rows };
  });
}

export async function createCropProfile(input: {
  tenantId: string;
  userId: string;
  code: string;
  name: string;
  cropGroup?: string | null;
  applicableRegions?: string[];
  applicableSystems?: string[];
  technicalNotes?: string | null;
}) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const result = await client.query(
      `INSERT INTO crop_profiles (code, name, crop_group, applicable_regions, applicable_systems, technical_notes, authored_by)
       VALUES ($1, $2, nullif($3,''), $4::text[], $5::text[], nullif($6,''), $7::uuid)
       RETURNING id::text, code, name, semantic_version AS "semanticVersion", status`,
      [input.code.trim().toUpperCase(), input.name.trim(), input.cropGroup ?? "", input.applicableRegions ?? [], input.applicableSystems ?? [], input.technicalNotes ?? "", input.userId],
    );
    const created = result.rows[0];
    await writeAudit(client, { tenantId: input.tenantId, userId: input.userId, action: "CROP_PROFILE_CREATED", entityType: "crop_profile", entityId: created.id, metadata: { code: created.code } });
    return created;
  });
}

export async function updateCropProfileStatus(input: { tenantId: string; userId: string; cropProfileId: string; status: "DRAFT" | "ACTIVE" | "SUPERSEDED" }) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const result = await client.query(
      `UPDATE crop_profiles SET status = $2::crop_profile_status, approved_by = CASE WHEN $2 = 'ACTIVE' THEN $3::uuid ELSE approved_by END, updated_at = now()
       WHERE id = $1::uuid
       RETURNING id::text, code, name, status`,
      [input.cropProfileId, input.status, input.userId],
    );
    const updated = result.rows[0];
    if (!updated) throw new AgronomicProfileError("Perfil de cultura não encontrado.", 404);
    await writeAudit(client, { tenantId: input.tenantId, userId: input.userId, action: "CROP_PROFILE_STATUS_CHANGED", entityType: "crop_profile", entityId: updated.id, metadata: { status: input.status } });
    return updated;
  });
}

export async function upsertCropProfileParameter(input: {
  tenantId: string;
  userId: string;
  cropProfileId: string;
  parameterCode: string;
  parameterCategory: "QUIMICO" | "FISICO" | "MICROBIOLOGICO";
  depthFromCm?: number | null;
  depthToCm?: number | null;
  analyticalMethodAllowed?: string[];
  unitExpected?: string | null;
  sufficiencyRanges?: object | null;
  criticality?: "BAIXA" | "MEDIA" | "ALTA" | null;
  technicalNotes?: string | null;
}) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const result = await client.query(
      `INSERT INTO crop_profile_parameters
       (crop_profile_id, parameter_code, parameter_category, depth_from_cm, depth_to_cm, analytical_method_allowed, unit_expected, sufficiency_ranges, criticality, technical_notes)
       VALUES ($1::uuid, $2, $3::lab_parameter_category, $4, $5, $6::text[], nullif($7,''), $8::jsonb, $9::parameter_criticality, nullif($10,''))
       ON CONFLICT (crop_profile_id, parameter_code, depth_from_cm, depth_to_cm)
       DO UPDATE SET parameter_category = EXCLUDED.parameter_category, analytical_method_allowed = EXCLUDED.analytical_method_allowed,
                     unit_expected = EXCLUDED.unit_expected, sufficiency_ranges = EXCLUDED.sufficiency_ranges,
                     criticality = EXCLUDED.criticality, technical_notes = EXCLUDED.technical_notes, updated_at = now()
       RETURNING id::text, parameter_code AS "parameterCode", status`,
      [
        input.cropProfileId,
        input.parameterCode.trim().toUpperCase(),
        input.parameterCategory,
        input.depthFromCm ?? null,
        input.depthToCm ?? null,
        input.analyticalMethodAllowed ?? [],
        input.unitExpected ?? "",
        input.sufficiencyRanges ? JSON.stringify(input.sufficiencyRanges) : null,
        input.criticality ?? null,
        input.technicalNotes ?? "",
      ],
    );
    const saved = result.rows[0];
    await writeAudit(client, { tenantId: input.tenantId, userId: input.userId, action: "CROP_PROFILE_PARAMETER_SAVED", entityType: "crop_profile_parameter", entityId: saved.id, metadata: { cropProfileId: input.cropProfileId, parameterCode: saved.parameterCode } });
    return saved;
  });
}

/**
 * Homologa (ou reverte) um parâmetro de perfil de cultura. Só um parâmetro
 * ACTIVE é usado pelo motor determinístico -- enquanto estiver DRAFT, ele
 * aparece no cadastro mas nunca entra numa interpretação real.
 */
export async function setCropProfileParameterStatus(input: { tenantId: string; userId: string; parameterId: string; status: "DRAFT" | "ACTIVE" | "SUPERSEDED" }) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const result = await client.query(
      `UPDATE crop_profile_parameters SET status = $2::crop_profile_status, updated_at = now() WHERE id = $1::uuid
       RETURNING id::text, parameter_code AS "parameterCode", status`,
      [input.parameterId, input.status],
    );
    const updated = result.rows[0];
    if (!updated) throw new AgronomicProfileError("Parâmetro não encontrado.", 404);
    await writeAudit(client, { tenantId: input.tenantId, userId: input.userId, action: "CROP_PROFILE_PARAMETER_STATUS_CHANGED", entityType: "crop_profile_parameter", entityId: updated.id, metadata: { status: input.status } });
    return updated;
  });
}

/**
 * Base de conhecimento agronômico. Só uma fonte com status ACTIVE pode ser
 * citada como referência técnica pela IA (ver evidence-package.ts) --
 * documentos em DRAFT existem no cadastro mas nunca chegam a uma geração
 * de IA real.
 */
export async function listTechnicalSources(tenantId: string, userId?: string) {
  return withTenant({ tenantId, userId }, async (client) => {
    const result = await client.query(
      `SELECT ts.id::text, ts.title, ts.institution, ts.edition_year AS "editionYear", ts.crop_profile_id::text AS "cropProfileId",
              cp.name AS "cropProfileName", ts.region_code AS "regionCode", ts.analytical_method AS "analyticalMethod",
              ts.subject, ts.semantic_version AS "semanticVersion", ts.valid_from::text AS "validFrom", ts.valid_until::text AS "validUntil",
              ts.status, ts.created_at::text AS "createdAt"
       FROM technical_sources ts LEFT JOIN crop_profiles cp ON cp.id = ts.crop_profile_id
       ORDER BY ts.created_at DESC`,
    );
    return result.rows;
  });
}

export async function createTechnicalSource(input: {
  tenantId: string; userId: string; title: string; institution?: string | null; editionYear?: number | null;
  cropProfileId?: string | null; regionCode?: string | null; analyticalMethod?: string | null; subject?: string | null;
  validFrom?: string | null; validUntil?: string | null; content?: string | null;
}) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const result = await client.query(
      `INSERT INTO technical_sources (title, institution, edition_year, crop_profile_id, region_code, analytical_method, subject, valid_from, valid_until, content, authored_by)
       VALUES ($1, nullif($2,''), $3, $4::uuid, nullif($5,''), nullif($6,''), nullif($7,''), $8::date, $9::date, nullif($10,''), $11::uuid)
       RETURNING id::text, title, status`,
      [
        input.title.trim(), input.institution ?? "", input.editionYear ?? null, input.cropProfileId ?? null,
        input.regionCode ?? "", input.analyticalMethod ?? "", input.subject ?? "", input.validFrom ?? null, input.validUntil ?? null,
        input.content ?? "", input.userId,
      ],
    );
    const created = result.rows[0];
    await writeAudit(client, { tenantId: input.tenantId, userId: input.userId, action: "TECHNICAL_SOURCE_CREATED", entityType: "technical_source", entityId: created.id, metadata: { title: created.title } });
    return created;
  });
}

export async function setTechnicalSourceStatus(input: { tenantId: string; userId: string; sourceId: string; status: "DRAFT" | "ACTIVE" | "SUPERSEDED" }) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const result = await client.query(
      `UPDATE technical_sources SET status = $2::crop_profile_status, approved_by = CASE WHEN $2 = 'ACTIVE' THEN $3::uuid ELSE approved_by END, updated_at = now()
       WHERE id = $1::uuid RETURNING id::text, title, status`,
      [input.sourceId, input.status, input.userId],
    );
    const updated = result.rows[0];
    if (!updated) throw new AgronomicProfileError("Fonte técnica não encontrada.", 404);
    await writeAudit(client, { tenantId: input.tenantId, userId: input.userId, action: "TECHNICAL_SOURCE_STATUS_CHANGED", entityType: "technical_source", entityId: updated.id, metadata: { status: input.status } });
    return updated;
  });
}

export async function listTechnicalRegions(tenantId: string, userId?: string) {
  return withTenant({ tenantId, userId }, async (client) => {
    const result = await client.query(`SELECT id::text, code, name, description FROM technical_regions ORDER BY name`);
    return result.rows;
  });
}

export async function createTechnicalRegion(input: { tenantId: string; userId: string; code: string; name: string; description?: string | null }) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const result = await client.query(
      `INSERT INTO technical_regions (code, name, description) VALUES ($1, $2, nullif($3,'')) RETURNING id::text, code, name, description`,
      [input.code.trim().toUpperCase(), input.name.trim(), input.description ?? ""],
    );
    const created = result.rows[0];
    await writeAudit(client, { tenantId: input.tenantId, userId: input.userId, action: "TECHNICAL_REGION_CREATED", entityType: "technical_region", entityId: created.id, metadata: { code: created.code } });
    return created;
  });
}

/** Somente leitura por enquanto: rule_sets existe desde a migration 001 para uma futura camada de
 * regras regionais mais amplas, mas o motor determinístico hoje resolve direto por crop_profiles. */
export async function listRuleSets(tenantId: string, userId?: string) {
  return withTenant({ tenantId, userId }, async (client) => {
    const result = await client.query(
      `SELECT id::text, code, semantic_version AS "semanticVersion", region_code AS "regionCode", supported_crops AS "supportedCrops",
              status, valid_from::text AS "validFrom", valid_until::text AS "validUntil", created_at::text AS "createdAt"
       FROM rule_sets ORDER BY created_at DESC`,
    );
    return result.rows;
  });
}
