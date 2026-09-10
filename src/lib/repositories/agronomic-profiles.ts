import { withTenant } from "@/lib/db";
import { writeAudit } from "@/lib/repositories/audit";
import { resolveParameterCrossValidationProvider } from "@/lib/ai/parameter-cross-validation-provider";

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

/**
 * Resumo real de homologação do catálogo -- usado pra tirar o cabeçalho fixo "regras homologadas" da
 * Biblioteca Técnica, que antes não dizia quantas culturas/parâmetros estavam de fato ACTIVE vs DRAFT
 * (bug real confirmado na auditoria, item I: cabeçalho estático podia passar a impressão de que tudo já
 * estava homologado). Conta o catálogo inteiro (não é filtrado por tenant -- ver comentário acima).
 */
export async function getCropCatalogHomologationSummary(tenantId: string, userId?: string) {
  return withTenant({ tenantId, userId }, async (client) => {
    const result = await client.query(
      `SELECT
         (SELECT count(*) FROM crop_profiles)::int AS "totalCrops",
         (SELECT count(*) FROM crop_profiles WHERE status = 'ACTIVE')::int AS "activeCrops",
         (SELECT count(*) FROM crop_profile_parameters)::int AS "totalParameters",
         (SELECT count(*) FROM crop_profile_parameters WHERE status = 'ACTIVE')::int AS "activeParameters"`,
    );
    return result.rows[0] as { totalCrops: number; activeCrops: number; totalParameters: number; activeParameters: number };
  });
}

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
              sample_type AS "sampleType",
              depth_from_cm::float8 AS "depthFromCm", depth_to_cm::float8 AS "depthToCm",
              analytical_method_allowed AS "analyticalMethodAllowed", unit_expected AS "unitExpected",
              sufficiency_ranges AS "sufficiencyRanges", criticality, yield_goal_bracket AS "yieldGoalBracket",
              technical_notes AS "technicalNotes", recommendation_rules AS "recommendationRules", status,
              ai_validation_status AS "aiValidationStatus", ai_validation_confidence::float8 AS "aiValidationConfidence",
              ai_validation_summary AS "aiValidationSummary", ai_validation_sources AS "aiValidationSources",
              ai_validation_model AS "aiValidationModel", ai_validated_at::text AS "aiValidatedAt",
              condition_parameter_code AS "conditionParameterCode",
              condition_min::float8 AS "conditionMin", condition_max::float8 AS "conditionMax",
              derived_parameter_code AS "derivedParameterCode",
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
  /** Ver `agronomic-engine.ts` -- tipo de amostra (solo, foliar, pecíolo...). Default 'SOLO' preserva comportamento existente. */
  sampleType?: "SOLO" | "FOLIAR" | "PECIOLO" | "MASSA_SECA" | "GRAO" | "SEMENTE" | "FERTILIZANTE" | "BIOLOGICO";
  depthFromCm?: number | null;
  depthToCm?: number | null;
  analyticalMethodAllowed?: string[];
  unitExpected?: string | null;
  sufficiencyRanges?: object | null;
  criticality?: "BAIXA" | "MEDIA" | "ALTA" | null;
  technicalNotes?: string | null;
  /** Ver `agronomic-engine.ts` -- condição opcional para desambiguar múltiplas faixas do mesmo parâmetro/profundidade/método (ex.: classe de argila para P). */
  conditionParameterCode?: string | null;
  conditionMin?: number | null;
  conditionMax?: number | null;
  /** Ver `agronomic-engine.ts` -- nome de uma função registrada em DERIVED_PARAMETER_FUNCTIONS (ex.: "FE_TOXICITY_PSFE"). Quando definido, `parameterCode` é um parâmetro virtual calculado, não um resultado de laboratório real. */
  derivedParameterCode?: string | null;
}) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const result = await client.query(
      `INSERT INTO crop_profile_parameters
       (crop_profile_id, parameter_code, parameter_category, sample_type, depth_from_cm, depth_to_cm, analytical_method_allowed, unit_expected, sufficiency_ranges, criticality, technical_notes, condition_parameter_code, condition_min, condition_max, derived_parameter_code)
       VALUES ($1::uuid, $2, $3::lab_parameter_category, $4, $5, $6, $7::text[], nullif($8,''), $9::jsonb, $10::parameter_criticality, nullif($11,''), nullif($12,''), $13, $14, nullif($15,''))
       ON CONFLICT (crop_profile_id, parameter_code, sample_type, depth_from_cm, depth_to_cm, condition_parameter_code, condition_min, condition_max)
       DO UPDATE SET parameter_category = EXCLUDED.parameter_category, analytical_method_allowed = EXCLUDED.analytical_method_allowed,
                     unit_expected = EXCLUDED.unit_expected, sufficiency_ranges = EXCLUDED.sufficiency_ranges,
                     criticality = EXCLUDED.criticality, technical_notes = EXCLUDED.technical_notes,
                     derived_parameter_code = EXCLUDED.derived_parameter_code, updated_at = now()
       RETURNING id::text, parameter_code AS "parameterCode", status`,
      [
        input.cropProfileId,
        input.parameterCode.trim().toUpperCase(),
        input.parameterCategory,
        input.sampleType ?? "SOLO",
        input.depthFromCm ?? null,
        input.depthToCm ?? null,
        input.analyticalMethodAllowed ?? [],
        input.unitExpected ?? "",
        input.sufficiencyRanges ? JSON.stringify(input.sufficiencyRanges) : null,
        input.criticality ?? null,
        input.technicalNotes ?? "",
        input.conditionParameterCode ?? "",
        input.conditionMin ?? null,
        input.conditionMax ?? null,
        input.derivedParameterCode ?? "",
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
 * Homologa em bloco todos os parâmetros DRAFT de um perfil de cultura que já têm faixa de suficiência
 * cadastrada (sem faixa, o parâmetro fica de fora -- não dá pra homologar "vazio"). Existe porque
 * homologar cultura por cultura, parâmetro por parâmetro, um por um, é o tipo de fricção que faz um
 * revisor real desistir no meio -- ex.: a soja tem 17 linhas de parâmetro (P e K se repetem por classe
 * de argila/CTC), então clicar 17 vezes pra revisar uma única cultura é um obstáculo desnecessário à
 * decisão que já foi tomada (a faixa já está lá, já é a mesma fonte técnica oficial). NÃO homologa o
 * perfil de cultura em si (isso continua uma ação separada e explícita) -- só os parâmetros.
 */
export async function activateAllCropProfileParameters(input: { tenantId: string; userId: string; cropProfileId: string }) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const result = await client.query(
      `UPDATE crop_profile_parameters SET status = 'ACTIVE', updated_at = now()
       WHERE crop_profile_id = $1::uuid AND status = 'DRAFT' AND sufficiency_ranges IS NOT NULL
       RETURNING id::text, parameter_code AS "parameterCode"`,
      [input.cropProfileId],
    );
    await writeAudit(client, {
      tenantId: input.tenantId, userId: input.userId, action: "CROP_PROFILE_PARAMETERS_BULK_ACTIVATED",
      entityType: "crop_profile", entityId: input.cropProfileId,
      metadata: { count: result.rowCount, parameterCodes: result.rows.map((r) => r.parameterCode) },
    });
    return result.rows;
  });
}

/**
 * Cruza UM parâmetro DRAFT com a literatura agronômica reconhecida via IA e salva o veredito em
 * `ai_validation_*` -- pedido do diretor, 2026-09-09, pra virar um sinal visível ("bate com a literatura" /
 * "diverge" / "sem base suficiente") que acelera a decisão do curador humano. Nunca muda `status` do
 * parâmetro: a homologação continua exigindo o clique humano em `setCropProfileParameterStatus` /
 * `activateAllCropProfileParameters`, sempre.
 */
export async function crossValidateCropProfileParameter(input: { tenantId: string; userId: string; parameterId: string }) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const parameterResult = await client.query(
      `SELECT cpp.id::text, cpp.parameter_code AS "parameterCode", cpp.parameter_category AS "parameterCategory",
              cpp.sample_type AS "sampleType", cpp.depth_from_cm::float8 AS "depthFromCm", cpp.depth_to_cm::float8 AS "depthToCm",
              cpp.unit_expected AS "unitExpected", cpp.analytical_method_allowed AS "analyticalMethodAllowed",
              cpp.sufficiency_ranges AS "sufficiencyRanges", cp.name AS "cropName", cp.code AS "cropCode"
       FROM crop_profile_parameters cpp JOIN crop_profiles cp ON cp.id = cpp.crop_profile_id
       WHERE cpp.id = $1::uuid`,
      [input.parameterId],
    );
    const parameter = parameterResult.rows[0];
    if (!parameter) throw new AgronomicProfileError("Parâmetro não encontrado.", 404);
    if (!parameter.sufficiencyRanges) throw new AgronomicProfileError("Cadastre as faixas de suficiência antes de cruzar com a IA.", 400);

    const provider = resolveParameterCrossValidationProvider();
    const validation = await provider.crossValidate({
      cropName: parameter.cropName,
      cropCode: parameter.cropCode,
      parameterCode: parameter.parameterCode,
      parameterCategory: parameter.parameterCategory,
      sampleType: parameter.sampleType,
      depthFromCm: parameter.depthFromCm,
      depthToCm: parameter.depthToCm,
      unitExpected: parameter.unitExpected,
      analyticalMethodAllowed: parameter.analyticalMethodAllowed ?? [],
      sufficiencyRanges: parameter.sufficiencyRanges,
    });

    const result = await client.query(
      `UPDATE crop_profile_parameters
       SET ai_validation_status = $2, ai_validation_confidence = $3, ai_validation_summary = $4,
           ai_validation_sources = $5::jsonb, ai_validation_model = $6, ai_validated_at = now(), updated_at = now()
       WHERE id = $1::uuid
       RETURNING id::text, parameter_code AS "parameterCode", ai_validation_status AS "aiValidationStatus",
                 ai_validation_confidence::float8 AS "aiValidationConfidence", ai_validation_summary AS "aiValidationSummary",
                 ai_validation_sources AS "aiValidationSources", ai_validation_model AS "aiValidationModel",
                 ai_validated_at::text AS "aiValidatedAt"`,
      [input.parameterId, validation.status, validation.confidence, validation.summary, JSON.stringify(validation.sources), validation.model],
    );
    const updated = result.rows[0];
    await writeAudit(client, {
      tenantId: input.tenantId, userId: input.userId, action: "CROP_PROFILE_PARAMETER_AI_VALIDATED",
      entityType: "crop_profile_parameter", entityId: updated.id,
      metadata: { status: validation.status, confidence: validation.confidence, model: validation.model, provider: validation.provider },
    });
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
