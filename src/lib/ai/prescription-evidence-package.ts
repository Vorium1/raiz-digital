import { evaluatePkDoseReadiness, type PkDoseReadiness } from "@/domain/recommendation-context";
import {
  computeDeterministicPkDose,
  evaluateUniformPkReadiness,
  type DeterministicPkDoseDecision,
  type UniformPkReadiness,
} from "@/domain/uniform-pk-readiness";
import { withTenant } from "@/lib/db";
import { computeSoybeanSulfurRecommendation, type SoybeanSulfurUniformDecision } from "@/domain/sulfur-dose-engine";
import { evaluateSoybeanLimingFromEvidence, type SoybeanLimingUniformDecision } from "@/domain/soybean-liming-evidence";
import { adaptLabResultsToSoilMicrobiology } from "@/domain/soil-microbiology-lab-adapter";
import { evaluateSoilMicrobiologyEvidence } from "@/domain/soil-microbiology-evidence";
import { evaluateBiologicalSoilEvidence, type BiologicalSoilCropGroup, type BiologicalSoilRegionScope } from "@/domain/biological-soil-analysis";
import { evaluateIrrigationContext } from "@/domain/irrigation-context";
import { evaluateIrrigationApplications, irrigationApplicationsFromContext } from "@/domain/irrigation-applications";
import { evaluateIrrigationWaterEvidence } from "@/domain/irrigation-water-assessment";
import { evaluateRiceContinuousNitrogenEnvelope, RESEARCH_READY_PROFILES } from "@/domain/research-ready-rules";
import { buildNitrogenOrganicMatterFingerprint, isOrganicMatterPercentUnit } from "@/domain/nitrogen-context";
import { evaluatePersistedNitrogenExecution, PRESCRIPTION_NITROGEN_RULE_IDS, type PersistedNitrogenExecution } from "@/domain/nitrogen-prescription-evidence";
import { evaluateWheatGrainQualityEvidence } from "@/domain/wheat-grain-quality-evidence";
import { evaluateStoredWheatBuyerQualityContext } from "@/domain/wheat-buyer-quality-context";

/**
 * Pacote de evidências para a IA de PRESCRIÇÃO.
 * A IA recebe a interpretação determinística aprovada e, para P/K, recebe também o resultado do gate
 * uniforme e as doses que o próprio motor determinístico calculou. Ela não cria dose paralela.
 */
export type AgronomicPrescriptionEvidencePackage = {
  tenant: { id: string; name: string };
  client: { id: string; name: string };
  property: { id: string; name: string; municipality: string; state: string };
  field: { id: string; name: string; areaHa: number };
  season: {
    id: string; label: string; currentCrop: string | null; nextCrop: string | null; nextCultivar: string | null;
    cultivar: string | null; managementSystem: string | null; soilTexture: string | null;
    yieldGoal: number | null; yieldGoalUnit: string | null; irrigated: boolean;
    technologyLevel: string | null; soilCompactionLevel: string | null;
    livestockTrampleAreaHa: number | null; headlandAreaHa: number | null;
    isFirstYearArea: boolean | null; cultivationYears: number | null;
    cultivationOrderAfterSoilAnalysis: number | null;
    cropProfileCode: string | null;
    wheatQualityObjectiveRequested: boolean;
    updatedAt: string;
  };
  pkDoseReadiness: PkDoseReadiness;
  uniformPkReadiness: UniformPkReadiness;
  deterministicPkDoses: Record<"P2O5" | "K2O", DeterministicPkDoseDecision>;
  deterministicSulfurDose?: SoybeanSulfurUniformDecision;
  deterministicLimingDecision?: SoybeanLimingUniformDecision;
  soilMicrobiologyEvidence: ReturnType<typeof evaluateSoilMicrobiologyEvidence>;
  biologicalSoilEvidence: ReturnType<typeof evaluateBiologicalSoilEvidence>;
  irrigationEvidence: ReturnType<typeof evaluateIrrigationContext>;
  irrigationApplicationEvidence: ReturnType<typeof evaluateIrrigationApplications>;
  irrigationWaterEvidence: ReturnType<typeof evaluateIrrigationWaterEvidence>;
  riceNitrogenEvidence: ReturnType<typeof buildRiceNitrogenEvidence>;
  deterministicNitrogenEvidence: ReturnType<typeof evaluatePersistedNitrogenExecution>;
  wheatGrainQualityEvidence: ReturnType<typeof evaluateWheatGrainQualityEvidence>;
  wheatBuyerQualityEvidence: ReturnType<typeof evaluateStoredWheatBuyerQualityContext>;
  region: { code: string | null };
  analysis: {
    id: string;
    code: string;
    status: string;
    createdAt: string;
    plannedManagementNotes: string | null;
    fertilityPlanningHorizonYears: 2 | 3 | 4 | 5 | null;
    fertilityCyclePlanNotes: string | null;
    irrigationContext: {
      waterRegime: "SEQUEIRO" | "IRRIGADO" | null;
      system: string | null;
      depthMm: number | null;
      frequencyDays: number | null;
      applicationTime: string | null;
      notes: string | null;
    };
  };
  deterministicInterpretation: {
    id: string;
    revision: number;
    status: string;
    cropProfileId: string | null;
    structuredOutput: unknown;
    warnings: unknown;
  } | null;
  results: Array<{
    sampleCode: string;
    parameterCode: string;
    value: number;
    unit: string;
    method: string;
    sampleType?: string | null;
    protocol?: string | null;
    depthFromCm?: number | null;
    depthToCm?: number | null;
  }>;
  yieldHistory: Array<{ seasonLabel: string; crop: string; cultivar: string | null; yieldValue: number; yieldUnit: string }>;
  technicalSources: Array<{ title: string; institution: string | null; editionYear: number | null; subject: string | null; content: string | null }>;
};

function interpretationItems(structuredOutput: unknown) {
  if (!structuredOutput || typeof structuredOutput !== "object" || Array.isArray(structuredOutput)) return [];
  const value = (structuredOutput as { interpretation?: unknown }).interpretation;
  return Array.isArray(value) ? value : [];
}

function analysisContextTillageSystem(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const draft = (value as { draft?: unknown }).draft;
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) return null;
  const tillageSystem = (draft as { tillageSystem?: unknown }).tillageSystem;
  return typeof tillageSystem === "string" && tillageSystem.trim() ? tillageSystem.trim() : null;
}

function analysisContextWheatBuyerQuality(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const draft = (value as { draft?: unknown }).draft;
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) return null;
  return (draft as { wheatBuyerQualityContext?: unknown }).wheatBuyerQualityContext ?? null;
}

function analysisContextPlannedManagementNotes(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const draft = (value as { draft?: unknown }).draft;
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) return null;
  const notes = (draft as { plannedManagementNotes?: unknown }).plannedManagementNotes;
  return typeof notes === "string" && notes.trim() ? notes.trim() : null;
}

function analysisContextFertilityPlanning(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { horizonYears: null as 2 | 3 | 4 | 5 | null, cyclePlanNotes: null as string | null };
  }
  const draft = (value as { draft?: unknown }).draft;
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) {
    return { horizonYears: null as 2 | 3 | 4 | 5 | null, cyclePlanNotes: null as string | null };
  }
  const source = draft as { fertilityPlanningHorizonYears?: unknown; fertilityCyclePlanNotes?: unknown };
  const horizon = Number(source.fertilityPlanningHorizonYears);
  return {
    horizonYears: [2, 3, 4, 5].includes(horizon) ? horizon as 2 | 3 | 4 | 5 : null,
    cyclePlanNotes: typeof source.fertilityCyclePlanNotes === "string" && source.fertilityCyclePlanNotes.trim()
      ? source.fertilityCyclePlanNotes.trim()
      : null,
  };
}


function biologicalRegionScope(state: string | null | undefined): BiologicalSoilRegionScope {
  const uf = state?.trim().toUpperCase() ?? "";
  return new Set(["RS", "SC", "PR"]).has(uf) ? "SOUTH_BRAZIL" : "OTHER_BRAZIL";
}

function biologicalCropGroup(cropCode: string | null | undefined): BiologicalSoilCropGroup {
  const crop = cropCode?.trim().toUpperCase() ?? "";
  if (new Set(["SOJA", "MILHO", "TRIGO", "ARROZ", "CANOLA", "CARINATA", "AVEIA", "CEVADA", "SORGO", "FEIJAO", "ALGODAO"]).has(crop)) {
    return "ANNUAL_GRAIN_FIBER";
  }
  if (crop.includes("CAFE")) return "COFFEE";
  if (crop.includes("CANA")) return "SUGARCANE";
  if (crop.includes("PAST") || crop.includes("AZEVEM") || crop.includes("BRAQUIARIA")) return "PASTURE";
  if (crop.includes("EUCALIP")) return "EUCALYPTUS";
  if (new Set(["TOMATE", "BATATA", "CEBOLA", "ALHO", "ALFACE", "CENOURA", "PIMENTAO"]).has(crop)) return "HORTICULTURE";
  if (new Set(["UVA", "MACA", "PESSEGO", "CITROS", "LARANJA"]).has(crop)) return "FRUIT";
  return "OTHER";
}

function analysisContextIrrigation(value: unknown) {
  const empty = {
    waterRegime: null as "SEQUEIRO" | "IRRIGADO" | null,
    system: null as string | null,
    depthMm: null as number | null,
    frequencyDays: null as number | null,
    applicationTime: null as string | null,
    notes: null as string | null,
  };
  if (!value || typeof value !== "object" || Array.isArray(value)) return empty;
  const draft = (value as { draft?: unknown }).draft;
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) return empty;
  const source = draft as Record<string, unknown>;
  const waterRegime: "SEQUEIRO" | "IRRIGADO" | null = source.waterRegime === "SEQUEIRO" || source.waterRegime === "IRRIGADO"
    ? source.waterRegime
    : null;
  const finitePositiveOrNull = (candidate: unknown) =>
    typeof candidate === "number" && Number.isFinite(candidate) && candidate > 0 ? candidate : null;
  const textOrNull = (candidate: unknown) =>
    typeof candidate === "string" && candidate.trim() ? candidate.trim() : null;
  return {
    waterRegime,
    system: textOrNull(source.irrigationSystem),
    depthMm: finitePositiveOrNull(source.irrigationDepthMm),
    frequencyDays: finitePositiveOrNull(source.irrigationFrequencyDays),
    applicationTime: textOrNull(source.irrigationApplicationTime),
    notes: textOrNull(source.irrigationNotes),
  };
}

function buildRiceNitrogenEvidence(
  cropProfileCode: string | null | undefined,
  rows: Array<{ sampleCode: string; parameterCode: string; value: number; unit: string }>,
) {
  if ((cropProfileCode?.trim().toUpperCase() ?? "") !== "ARROZ") return null;

  const organicMatterRows = rows.filter((row) => row.parameterCode === "MO");
  if (organicMatterRows.length === 0) {
    return {
      status: "NOT_EVALUATED" as const,
      automaticDoseAllowed: false as const,
      uniformOrganicMatterBand: null,
      envelopes: [],
      limitations: ["RICE_N_REQUIRES_ORGANIC_MATTER_PERCENT"],
    };
  }

  const limitations: string[] = [];
  const envelopes: Array<{
    sampleCode: string;
    organicMatterPct: number;
    organicMatterBand: string;
    alternatives: ReturnType<typeof evaluateRiceContinuousNitrogenEnvelope>["alternatives"];
  }> = [];

  for (const row of organicMatterRows) {
    if (!isOrganicMatterPercentUnit(row.unit)) {
      limitations.push(`RICE_N_OM_UNIT_UNSUPPORTED:${row.sampleCode}:${row.unit}`);
      continue;
    }
    if (!Number.isFinite(row.value) || row.value < 0) {
      limitations.push(`RICE_N_OM_INVALID:${row.sampleCode}`);
      continue;
    }
    try {
      const envelope = evaluateRiceContinuousNitrogenEnvelope({
        profileId: RESEARCH_READY_PROFILES.rice,
        organicMatterPct: row.value,
      });
      envelopes.push({
        sampleCode: row.sampleCode,
        organicMatterPct: row.value,
        organicMatterBand: envelope.organicMatterBand,
        alternatives: envelope.alternatives,
      });
    } catch (error) {
      limitations.push(
        `RICE_N_OM_NOT_CLASSIFIABLE:${row.sampleCode}:${error instanceof Error ? error.message : "erro"}`,
      );
    }
  }

  if (envelopes.length === 0) {
    return {
      status: "NOT_EVALUATED" as const,
      automaticDoseAllowed: false as const,
      uniformOrganicMatterBand: null,
      envelopes: [],
      limitations,
    };
  }

  const bands = [...new Set(envelopes.map((item) => item.organicMatterBand))];
  if (bands.length > 1) limitations.push("RICE_N_OM_BANDS_CONFLICT_NO_UNIFORM_DOSE");

  return {
    status: bands.length === 1 ? "OFFICIAL_ENVELOPE" as const : "MULTI_BAND_OFFICIAL_ENVELOPE" as const,
    ruleId: "N-ARROZ-CONTINUO-SOSBAI-2025" as const,
    source: "SOSBAI 2025, Tabela 4.5, p.46" as const,
    automaticDoseAllowed: false as const,
    responseClassResolved: false as const,
    blocker: "RICE_RESPONSE_CLASS_NOT_RESOLVED" as const,
    uniformOrganicMatterBand: bands.length === 1 ? bands[0] : null,
    envelopes,
    limitations,
  };
}

export async function buildAgronomicPrescriptionEvidencePackage(tenantId: string, userId: string, analysisId: string): Promise<AgronomicPrescriptionEvidencePackage | null> {
  return withTenant({ tenantId, userId }, async (client) => {
    const tenantResult = await client.query(`SELECT id::text, trade_name AS name FROM tenants WHERE id = $1::uuid`, [tenantId]);
    const tenant = tenantResult.rows[0];
    if (!tenant) return null;

    // Snapshot consistente: nova importação (FOR UPDATE em analyses) e edição da safra ficam esperando
    // enquanto results + interpretação + contexto são lidos nesta mesma transação.
    const baseResult = await client.query(
      `SELECT a.id::text, a.code, a.status::text, a.created_at::text AS "createdAt",
              c.id::text AS "clientId", c.name AS "clientName",
              p.id::text AS "propertyId", p.name AS "propertyName", p.municipality, p.state,
              f.id::text AS "fieldId", f.name AS "fieldName", f.area_ha::float8 AS "areaHa",
              a.analysis_context AS "analysisContext",
              cs.id::text AS "seasonId", cs.season_label AS "seasonLabel", cs.current_crop AS "currentCrop",
              cs.next_crop AS "nextCrop", cs.next_cultivar AS "nextCultivar", cs.cultivar,
              cs.management_system AS "managementSystem", cs.soil_texture AS "soilTexture",
              cs.yield_goal::float8 AS "yieldGoal", cs.yield_goal_unit AS "yieldGoalUnit", cs.irrigated,
              cs.technology_level AS "technologyLevel", cs.soil_compaction_level AS "soilCompactionLevel",
              cs.livestock_trample_area_ha::float8 AS "livestockTrampleAreaHa", cs.headland_area_ha::float8 AS "headlandAreaHa",
              cs.is_first_year_area AS "isFirstYearArea", cs.cultivation_years AS "cultivationYears",
              cs.cultivation_order_after_soil_analysis AS "cultivationOrderAfterSoilAnalysis",
              cs.updated_at::text AS "seasonUpdatedAt",
              cs.technical_region_code AS "regionCode", cs.crop_profile_id::text AS "cropProfileId",
              cp.code AS "cropProfileCode",
              coalesce(nc.late_quality_n_requested, false) AS "wheatQualityObjectiveRequested"
       FROM analyses a
       JOIN crop_seasons cs ON cs.tenant_id = a.tenant_id AND cs.id = a.crop_season_id
       JOIN fields f ON f.tenant_id = cs.tenant_id AND f.id = cs.field_id
       JOIN properties p ON p.tenant_id = f.tenant_id AND p.id = f.property_id
       JOIN clients c ON c.tenant_id = p.tenant_id AND c.id = p.client_id
       LEFT JOIN crop_profiles cp ON cp.id = cs.crop_profile_id
       LEFT JOIN nitrogen_recommendation_contexts nc
         ON nc.tenant_id = cs.tenant_id AND nc.crop_season_id = cs.id
       WHERE a.tenant_id = $1::uuid AND a.id = $2::uuid
       FOR SHARE OF a, cs`,
      [tenantId, analysisId],
    );
    const base = baseResult.rows[0];
    if (!base) return null;

    const [resultsResult, interpretationResult, nitrogenExecutionResult] = await Promise.all([
      client.query(
        `SELECT ls.laboratory_code AS "sampleCode", ls.sample_type AS "sampleType",
                lr.parameter_code AS "parameterCode",
                lr.numeric_value::float8 AS value, lr.unit, lr.analytical_method AS method,
                lr.original_payload->>'protocol' AS protocol,
                COALESCE(sp.depth_from_cm::float8, NULLIF(lr.original_payload->>'depthFromCm', '')::float8) AS "depthFromCm",
                COALESCE(sp.depth_to_cm::float8, NULLIF(lr.original_payload->>'depthToCm', '')::float8) AS "depthToCm"
         FROM lab_samples ls
         JOIN lab_results lr ON lr.tenant_id = ls.tenant_id AND lr.lab_sample_id = ls.id
         LEFT JOIN sample_points sp ON sp.tenant_id = ls.tenant_id AND sp.id = ls.sample_point_id
         WHERE ls.tenant_id = $1::uuid AND ls.analysis_id = $2::uuid
         ORDER BY ls.laboratory_code, lr.parameter_code`,
        [tenantId, analysisId],
      ),
      client.query(
        `SELECT id::text, revision, status::text, crop_profile_id::text AS "cropProfileId",
                structured_output AS "structuredOutput", warnings
         FROM interpretations
         WHERE tenant_id = $1::uuid AND analysis_id = $2::uuid
         ORDER BY revision DESC
         LIMIT 1`,
        [tenantId, analysisId],
      ),
      client.query<PersistedNitrogenExecution>(
        `SELECT id::text,
                rule_id AS "ruleId",
                rule_version AS "ruleVersion",
                source_snapshot_id AS "sourceSnapshotId",
                execution_status AS "executionStatus",
                created_at::text AS "createdAt",
                input_payload AS "inputPayload",
                output_payload AS "outputPayload"
         FROM agronomic_rule_executions
         WHERE tenant_id = $1::uuid
           AND analysis_id = $2::uuid
           AND rule_id = ANY($3::text[])
         ORDER BY created_at DESC, id DESC
         LIMIT 1`,
        [tenantId, analysisId, [...PRESCRIPTION_NITROGEN_RULE_IDS]],
      ),
    ]);

    const yieldHistoryResult = await client.query(
      `SELECT season_label AS "seasonLabel", crop, cultivar, yield_value::float8 AS "yieldValue", yield_unit AS "yieldUnit"
       FROM field_yield_history WHERE tenant_id = $1::uuid AND field_id = $2::uuid ORDER BY created_at DESC LIMIT 10`,
      [tenantId, base.fieldId],
    );

    const sourcesResult = base.cropProfileId
      ? await client.query(
          `SELECT title, institution, edition_year AS "editionYear", subject, content FROM technical_sources WHERE (crop_profile_id = $1::uuid OR crop_profile_id IS NULL) AND status = 'ACTIVE' ORDER BY title`,
          [base.cropProfileId],
        )
      : await client.query(
          `SELECT title, institution, edition_year AS "editionYear", subject, content FROM technical_sources WHERE crop_profile_id IS NULL AND status = 'ACTIVE' ORDER BY title`,
        );

    const nitrogenOrganicMatterFingerprint = buildNitrogenOrganicMatterFingerprint(
      resultsResult.rows
        .filter((row) => new Set(["OM", "MO", "ORGANIC_MATTER"]).has(String(row.parameterCode).trim().toUpperCase()))
        .map((row) => ({
          sampleCode: row.sampleCode,
          value: row.value,
          unit: row.unit,
          method: row.method,
        })),
    );
    const deterministicNitrogenEvidence = evaluatePersistedNitrogenExecution({
      execution: nitrogenExecutionResult.rows[0] ?? null,
      currentSeasonUpdatedAt: base.seasonUpdatedAt,
      currentOrganicMatterFingerprint: nitrogenOrganicMatterFingerprint,
    });
    const wheatGrainQualityEvidence = evaluateWheatGrainQualityEvidence({
      cropProfileCode: base.cropProfileCode,
      currentCrop: base.currentCrop,
      nextCrop: base.nextCrop,
      currentCultivar: base.cultivar,
      nextCultivar: base.nextCultivar,
      rows: resultsResult.rows,
    });
    const wheatBuyerQualityEvidence = evaluateStoredWheatBuyerQualityContext(
      analysisContextWheatBuyerQuality(base.analysisContext),
      base.cropProfileCode,
    );

    const deterministicInterpretation = interpretationResult.rows[0] ?? null;
    const interpreted = interpretationItems(deterministicInterpretation?.structuredOutput);
    const pkDoseReadiness = evaluatePkDoseReadiness({
      yieldGoal: base.yieldGoal,
      yieldGoalUnit: base.yieldGoalUnit,
      cultivationOrderAfterSoilAnalysis: base.cultivationOrderAfterSoilAnalysis,
    });
    const uniformPkReadiness = evaluateUniformPkReadiness({ cropCode: base.cropProfileCode, interpretation: interpreted });
    const deterministicPkDoses = {
      P2O5: computeDeterministicPkDose({
        cropCode: base.cropProfileCode,
        interpretation: interpreted,
        yieldGoal: base.yieldGoal,
        yieldGoalUnit: base.yieldGoalUnit,
        cultivationOrderAfterSoilAnalysis: base.cultivationOrderAfterSoilAnalysis,
        nutrient: "P2O5",
      }),
      K2O: computeDeterministicPkDose({
        cropCode: base.cropProfileCode,
        interpretation: interpreted,
        yieldGoal: base.yieldGoal,
        yieldGoalUnit: base.yieldGoalUnit,
        cultivationOrderAfterSoilAnalysis: base.cultivationOrderAfterSoilAnalysis,
        nutrient: "K2O",
      }),
    };

    const deterministicSulfurDose = computeSoybeanSulfurRecommendation({
      cropCode: base.cropProfileCode,
      observations: resultsResult.rows
        .filter((row) => row.parameterCode === "S")
        .map((row) => ({
          sampleCode: row.sampleCode,
          sulfurMgDm3: row.value,
          method: row.method,
          depthFromCm: row.depthFromCm ?? null,
          depthToCm: row.depthToCm ?? null,
        })),
    });

    const deterministicLimingDecision = evaluateSoybeanLimingFromEvidence({
      cropCode: base.cropProfileCode,
      state: base.state,
      managementSystem: base.managementSystem ?? analysisContextTillageSystem(base.analysisContext),
      results: resultsResult.rows,
    });

    const soilMicrobiologyEvidence = evaluateSoilMicrobiologyEvidence({
      observations: adaptLabResultsToSoilMicrobiology(resultsResult.rows),
      cropCode: base.cropProfileCode,
      regionCode: base.state,
      validatedAgronomicRuleIds: [],
    });

    const bioAsRows = resultsResult.rows.filter((row) => row.parameterCode.startsWith("BIOAS_"));
    const biologicalSoilEvidence = evaluateBiologicalSoilEvidence({
      regionScope: biologicalRegionScope(base.state),
      cropGroup: biologicalCropGroup(base.cropProfileCode),
      observations: bioAsRows.map((row) => ({
        parameterCode: row.parameterCode,
        value: row.value,
        unit: row.unit,
        method: row.method,
        depthFromCm: row.depthFromCm ?? null,
        depthToCm: row.depthToCm ?? null,
        sourceKind: row.parameterCode.startsWith("BIOAS_IQS_") || row.parameterCode.endsWith("_SCORE")
          ? "LAB_DERIVED_INDEX"
          : "LAB_MEASURED",
      })),
      officialLabInterpretationAvailable: bioAsRows.some((row) =>
        row.parameterCode.startsWith("BIOAS_IQS_") || row.parameterCode.endsWith("_SCORE")
      ),
      sourceVersion: bioAsRows.map((row) => row.protocol ?? row.method).find((value) => value?.trim()) ?? null,
    });

    const rawIrrigation = analysisContextIrrigation(base.analysisContext);
    const irrigationEvidence = evaluateIrrigationContext({
      waterRegime: rawIrrigation.waterRegime ?? "",
      irrigationSystem: rawIrrigation.system,
      irrigationDepthMm: rawIrrigation.depthMm,
      irrigationFrequencyDays: rawIrrigation.frequencyDays,
      irrigationApplicationTime: rawIrrigation.applicationTime,
      irrigationNotes: rawIrrigation.notes,
    });

    return {
      tenant: { id: tenant.id, name: tenant.name },
      client: { id: base.clientId, name: base.clientName },
      property: { id: base.propertyId, name: base.propertyName, municipality: base.municipality, state: base.state },
      field: { id: base.fieldId, name: base.fieldName, areaHa: base.areaHa },
      season: {
        id: base.seasonId, label: base.seasonLabel, currentCrop: base.currentCrop, nextCrop: base.nextCrop, nextCultivar: base.nextCultivar,
        cultivar: base.cultivar, managementSystem: base.managementSystem, soilTexture: base.soilTexture,
        yieldGoal: base.yieldGoal, yieldGoalUnit: base.yieldGoalUnit, irrigated: base.irrigated,
        technologyLevel: base.technologyLevel, soilCompactionLevel: base.soilCompactionLevel,
        livestockTrampleAreaHa: base.livestockTrampleAreaHa, headlandAreaHa: base.headlandAreaHa,
        isFirstYearArea: base.isFirstYearArea, cultivationYears: base.cultivationYears,
        cultivationOrderAfterSoilAnalysis: base.cultivationOrderAfterSoilAnalysis,
        cropProfileCode: base.cropProfileCode ?? null,
        wheatQualityObjectiveRequested:
          base.wheatQualityObjectiveRequested === true
          || wheatBuyerQualityEvidence.status === "EVALUATED",
        updatedAt: base.seasonUpdatedAt,
      },
      pkDoseReadiness,
      uniformPkReadiness,
      deterministicPkDoses,
      deterministicSulfurDose,
      deterministicLimingDecision,
      soilMicrobiologyEvidence,
      biologicalSoilEvidence,
      irrigationEvidence,
      irrigationApplicationEvidence: evaluateIrrigationApplications(irrigationApplicationsFromContext(base.analysisContext)),
      // Nesta etapa só o regime declarado é encaminhado ao gate hídrico. Lâmina do
      // usuário/aplicação não é promovida a irrigação LÍQUIDA e nenhum ETc/chuva
      // efetiva/armazenamento é fabricado. Quando esses motores forem homologados,
      // o mesmo contrato sobe progressivamente para demanda/balanço.
      irrigationWaterEvidence: evaluateIrrigationWaterEvidence({
        waterRegime: rawIrrigation.waterRegime ?? "",
      }),
      riceNitrogenEvidence: buildRiceNitrogenEvidence(base.cropProfileCode, resultsResult.rows),
      deterministicNitrogenEvidence,
      wheatGrainQualityEvidence,
      wheatBuyerQualityEvidence,
      region: { code: base.regionCode },
      analysis: {
        id: base.id,
        code: base.code,
        status: base.status,
        createdAt: base.createdAt,
        plannedManagementNotes: analysisContextPlannedManagementNotes(base.analysisContext),
        fertilityPlanningHorizonYears: analysisContextFertilityPlanning(base.analysisContext).horizonYears,
        fertilityCyclePlanNotes: analysisContextFertilityPlanning(base.analysisContext).cyclePlanNotes,
        irrigationContext: analysisContextIrrigation(base.analysisContext),
      },
      deterministicInterpretation,
      results: resultsResult.rows,
      yieldHistory: yieldHistoryResult.rows,
      technicalSources: sourcesResult.rows,
    };
  });
}
