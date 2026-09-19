import { evaluatePkDoseReadiness, type PkDoseReadiness } from "@/domain/recommendation-context";
import {
  computeDeterministicPkDose,
  evaluateUniformPkReadiness,
  type DeterministicPkDoseDecision,
  type UniformPkReadiness,
} from "@/domain/uniform-pk-readiness";
import { withTenant } from "@/lib/db";
import { computeSoybeanSulfurRecommendation, type SoybeanSulfurUniformDecision } from "@/domain/sulfur-dose-engine";

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
    updatedAt: string;
  };
  pkDoseReadiness: PkDoseReadiness;
  uniformPkReadiness: UniformPkReadiness;
  deterministicPkDoses: Record<"P2O5" | "K2O", DeterministicPkDoseDecision>;
  deterministicSulfurDose?: SoybeanSulfurUniformDecision;
  region: { code: string | null };
  analysis: { id: string; code: string; status: string; createdAt: string };
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
              cp.code AS "cropProfileCode"
       FROM analyses a
       JOIN crop_seasons cs ON cs.tenant_id = a.tenant_id AND cs.id = a.crop_season_id
       JOIN fields f ON f.tenant_id = cs.tenant_id AND f.id = cs.field_id
       JOIN properties p ON p.tenant_id = f.tenant_id AND p.id = f.property_id
       JOIN clients c ON c.tenant_id = p.tenant_id AND c.id = p.client_id
       LEFT JOIN crop_profiles cp ON cp.id = cs.crop_profile_id
       WHERE a.tenant_id = $1::uuid AND a.id = $2::uuid
       FOR SHARE OF a, cs`,
      [tenantId, analysisId],
    );
    const base = baseResult.rows[0];
    if (!base) return null;

    const [resultsResult, interpretationResult] = await Promise.all([
      client.query(
        `SELECT ls.laboratory_code AS "sampleCode", lr.parameter_code AS "parameterCode",
                lr.numeric_value::float8 AS value, lr.unit, lr.analytical_method AS method,
                lr.original_payload->>'protocol' AS protocol,
                sp.depth_from_cm::float8 AS "depthFromCm", sp.depth_to_cm::float8 AS "depthToCm"
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
        updatedAt: base.seasonUpdatedAt,
      },
      pkDoseReadiness,
      uniformPkReadiness,
      deterministicPkDoses,
      deterministicSulfurDose,
      region: { code: base.regionCode },
      analysis: { id: base.id, code: base.code, status: base.status, createdAt: base.createdAt },
      deterministicInterpretation,
      results: resultsResult.rows,
      yieldHistory: yieldHistoryResult.rows,
      technicalSources: sourcesResult.rows,
    };
  });
}
