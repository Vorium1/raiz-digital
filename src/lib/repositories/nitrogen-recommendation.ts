import {
  buildNitrogenOrganicMatterFingerprint,
  evaluateNitrogenRecommendationReadiness,
  isOrganicMatterPercentUnit,
  type NitrogenContextFields,
} from "@/domain/nitrogen-context";
import {
  computeCanolaNitrogenRecommendation,
  computeCornNitrogenRecommendation,
  computeWheatNitrogenRecommendation,
  computeWinterPastureNitrogenRecommendation,
  type NitrogenRecommendation,
} from "@/domain/nitrogen-dose-engine";
import { withTenant } from "@/lib/db";
import { writeAudit } from "@/lib/repositories/audit";
import { recordAgronomicRuleExecution } from "@/lib/repositories/agronomic-rule-executions";

export class NitrogenRecommendationError extends Error {
  constructor(message: string, readonly status = 422, readonly details?: unknown) {
    super(message);
    this.name = "NitrogenRecommendationError";
  }
}

type ContextRow = {
  cornPrecedingClass: "LEGUME_OR_FALLOW" | "GRASS" | "GRASS_SUCCESSION" | null;
  plannedPopulationPlantsPerHa: number | null;
  residueClass: "LEGUME" | "GRASS" | "UNKNOWN" | null;
  residueBiomassTonPerHa: number | null;
  wheatPrecedingCrop: "SOY" | "CORN" | null;
  lateQualityNitrogenRequested: boolean | null;
  pastureType: "ANNUAL_GRASS" | "PERENNIAL_GRASS" | "LEGUME" | null;
  targetDryMatterTonPerHa: number | null;
  precedingLegume: boolean | null;
  effectiveLegumeInoculation: boolean | null;
  provenLegumeInoculationFailure: boolean | null;
  numberOfUses: number | null;
  updatedAt: string | null;
};

type BaseRow = {
  analysisId: string;
  cropSeasonId: string;
  currentCrop: string | null;
  nextCrop: string | null;
  yieldGoal: number | null;
  yieldGoalUnit: string | null;
  seasonUpdatedAt: string;
} & ContextRow;

const EMPTY_CONTEXT: ContextRow = {
  cornPrecedingClass: null,
  plannedPopulationPlantsPerHa: null,
  residueClass: null,
  residueBiomassTonPerHa: null,
  wheatPrecedingCrop: null,
  lateQualityNitrogenRequested: false,
  pastureType: null,
  targetDryMatterTonPerHa: null,
  precedingLegume: null,
  effectiveLegumeInoculation: null,
  provenLegumeInoculationFailure: null,
  numberOfUses: null,
  updatedAt: null,
};

function contextFromRow(row: Partial<ContextRow> | null | undefined): ContextRow {
  return {
    ...EMPTY_CONTEXT,
    ...(row ?? {}),
    lateQualityNitrogenRequested: row?.lateQualityNitrogenRequested ?? false,
  };
}

function computeRecommendation(input: {
  readiness: ReturnType<typeof evaluateNitrogenRecommendationReadiness>;
  context: ContextRow;
}): NitrogenRecommendation {
  if (!input.readiness.ready) {
    throw new NitrogenRecommendationError("O contexto mínimo para calcular N ainda não está completo.", 422, {
      blockers: input.readiness.blockers,
    });
  }

  const crop = input.readiness.normalized.targetCrop!;
  const om = input.readiness.normalized.representativeOrganicMatterPct!;
  const yieldGoal = input.readiness.normalized.targetYieldTonPerHa;
  const context = input.context;

  if (crop === "MILHO") {
    return computeCornNitrogenRecommendation({
      organicMatterPct: om,
      precedingClass: context.cornPrecedingClass!,
      targetYieldTonPerHa: yieldGoal!,
      plannedPopulationPlantsPerHa: context.plannedPopulationPlantsPerHa!,
      residueClass: context.residueClass!,
      residueBiomassTonPerHa: context.residueBiomassTonPerHa,
    });
  }
  if (crop === "TRIGO") {
    return computeWheatNitrogenRecommendation({
      organicMatterPct: om,
      precedingCrop: context.wheatPrecedingCrop!,
      targetYieldTonPerHa: yieldGoal!,
      lateQualityNitrogenRequested: context.lateQualityNitrogenRequested ?? false,
    });
  }
  if (crop === "CANOLA") {
    return computeCanolaNitrogenRecommendation({
      organicMatterPct: om,
      targetYieldTonPerHa: yieldGoal!,
    });
  }
  return computeWinterPastureNitrogenRecommendation({
    organicMatterPct: om,
    pastureType: context.pastureType!,
    targetDryMatterTonPerHa: input.readiness.normalized.targetDryMatterTonPerHa!,
    precedingLegume: context.precedingLegume!,
    effectiveLegumeInoculation: context.effectiveLegumeInoculation ?? undefined,
    provenLegumeInoculationFailure: context.provenLegumeInoculationFailure ?? undefined,
    numberOfUses: context.numberOfUses,
  });
}

export async function getNitrogenRecommendationWorkspace(input: {
  tenantId: string;
  userId: string;
  analysisId: string;
}) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const baseResult = await client.query<BaseRow>(
      `SELECT a.id::text AS "analysisId",
              cs.id::text AS "cropSeasonId",
              cs.current_crop AS "currentCrop",
              cs.next_crop AS "nextCrop",
              cs.yield_goal::float8 AS "yieldGoal",
              cs.yield_goal_unit AS "yieldGoalUnit",
              cs.updated_at::text AS "seasonUpdatedAt",
              nc.corn_preceding_class AS "cornPrecedingClass",
              nc.planned_population_plants_per_ha::float8 AS "plannedPopulationPlantsPerHa",
              nc.residue_class AS "residueClass",
              nc.residue_biomass_ton_per_ha::float8 AS "residueBiomassTonPerHa",
              nc.wheat_preceding_crop AS "wheatPrecedingCrop",
              nc.late_quality_n_requested AS "lateQualityNitrogenRequested",
              nc.pasture_type AS "pastureType",
              nc.target_dry_matter_ton_per_ha::float8 AS "targetDryMatterTonPerHa",
              nc.preceding_legume AS "precedingLegume",
              nc.effective_legume_inoculation AS "effectiveLegumeInoculation",
              nc.proven_legume_inoculation_failure AS "provenLegumeInoculationFailure",
              nc.number_of_uses AS "numberOfUses",
              nc.updated_at::text AS "updatedAt"
       FROM analyses a
       JOIN crop_seasons cs ON cs.tenant_id = a.tenant_id AND cs.id = a.crop_season_id
       LEFT JOIN nitrogen_recommendation_contexts nc
         ON nc.tenant_id = cs.tenant_id AND nc.crop_season_id = cs.id
       WHERE a.tenant_id = $1::uuid AND a.id = $2::uuid
       LIMIT 1`,
      [input.tenantId, input.analysisId],
    );
    const base = baseResult.rows[0];
    if (!base) throw new NitrogenRecommendationError("Análise não encontrada.", 404);

    const omResult = await client.query<{ value: number; unit: string; method: string; sampleCode: string }>(
      `SELECT lr.numeric_value::float8 AS value,
              lr.unit,
              lr.analytical_method AS method,
              ls.laboratory_code AS "sampleCode"
       FROM lab_samples ls
       JOIN lab_results lr ON lr.tenant_id = ls.tenant_id AND lr.lab_sample_id = ls.id
       WHERE ls.tenant_id = $1::uuid
         AND ls.analysis_id = $2::uuid
         AND upper(lr.parameter_code) IN ('OM','MO','ORGANIC_MATTER')
       ORDER BY ls.laboratory_code, lr.created_at`,
      [input.tenantId, input.analysisId],
    );

    const context = contextFromRow(base);
    const targetCropRaw = base.nextCrop?.trim() || base.currentCrop?.trim() || null;
    const targetCropSource = base.nextCrop?.trim() ? "NEXT_CROP" : base.currentCrop?.trim() ? "CURRENT_CROP" : "MISSING";
    const organicMatterUnits = [...new Set(omResult.rows.map((row) => row.unit))];
    const percentRows = omResult.rows.filter((row) => isOrganicMatterPercentUnit(row.unit));
    const organicMatterObservations = omResult.rows.map((row) => ({
      sampleCode: row.sampleCode,
      value: row.value,
      unit: row.unit,
      method: row.method,
    }));
    const organicMatterFingerprint = buildNitrogenOrganicMatterFingerprint(organicMatterObservations);

    const readiness = evaluateNitrogenRecommendationReadiness({
      targetCropRaw,
      yieldGoal: base.yieldGoal,
      yieldGoalUnit: base.yieldGoalUnit,
      organicMatterValuesPct: percentRows.map((row) => row.value),
      organicMatterUnits,
      context,
    });

    const recommendationPreview = readiness.ready ? computeRecommendation({ readiness, context }) : null;

    return {
      analysisId: base.analysisId,
      cropSeasonId: base.cropSeasonId,
      targetCropRaw,
      targetCropSource,
      yieldGoal: base.yieldGoal,
      yieldGoalUnit: base.yieldGoalUnit,
      seasonUpdatedAt: base.seasonUpdatedAt,
      context,
      organicMatter: {
        resultCount: omResult.rows.length,
        percentResultCount: percentRows.length,
        valuesPct: percentRows.map((row) => row.value),
        units: organicMatterUnits,
        methods: [...new Set(omResult.rows.map((row) => row.method))],
        sampleCodes: [...new Set(omResult.rows.map((row) => row.sampleCode))],
        observations: organicMatterObservations,
        fingerprint: organicMatterFingerprint,
      },
      readiness,
      recommendationPreview,
    };
  });
}

const CORN_PRECEDING = new Set(["LEGUME_OR_FALLOW", "GRASS", "GRASS_SUCCESSION"]);
const RESIDUE = new Set(["LEGUME", "GRASS", "UNKNOWN"]);
const WHEAT_PRECEDING = new Set(["SOY", "CORN"]);
const PASTURE = new Set(["ANNUAL_GRASS", "PERENNIAL_GRASS", "LEGUME"]);

function validateContext(context: ContextRow) {
  if (context.cornPrecedingClass && !CORN_PRECEDING.has(context.cornPrecedingClass)) throw new NitrogenRecommendationError("Classe de cultura anterior do milho inválida.", 400);
  if (context.residueClass && !RESIDUE.has(context.residueClass)) throw new NitrogenRecommendationError("Classe de resíduo inválida.", 400);
  if (context.wheatPrecedingCrop && !WHEAT_PRECEDING.has(context.wheatPrecedingCrop)) throw new NitrogenRecommendationError("Cultura anterior do trigo inválida.", 400);
  if (context.pastureType && !PASTURE.has(context.pastureType)) throw new NitrogenRecommendationError("Tipo de pastagem inválido.", 400);

  if (context.plannedPopulationPlantsPerHa != null && (!Number.isFinite(context.plannedPopulationPlantsPerHa) || context.plannedPopulationPlantsPerHa <= 0)) throw new NitrogenRecommendationError("População planejada precisa ser maior que zero.", 400);
  if (context.residueBiomassTonPerHa != null && (!Number.isFinite(context.residueBiomassTonPerHa) || context.residueBiomassTonPerHa < 0)) throw new NitrogenRecommendationError("Biomassa de resíduo não pode ser negativa.", 400);
  if (context.targetDryMatterTonPerHa != null && (!Number.isFinite(context.targetDryMatterTonPerHa) || context.targetDryMatterTonPerHa <= 0)) throw new NitrogenRecommendationError("Meta de matéria seca precisa ser maior que zero.", 400);
  if (context.numberOfUses != null && (!Number.isInteger(context.numberOfUses) || context.numberOfUses < 0)) throw new NitrogenRecommendationError("Número de usos deve ser inteiro maior ou igual a zero.", 400);
  if (context.effectiveLegumeInoculation === true && context.provenLegumeInoculationFailure === true) throw new NitrogenRecommendationError("Inoculação eficaz e falha comprovada não podem ser verdadeiras ao mesmo tempo.", 400);
}

export async function updateNitrogenRecommendationContext(input: {
  tenantId: string;
  userId: string;
  cropSeasonId: string;
  patch: Partial<NitrogenContextFields>;
}) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const season = await client.query(`SELECT id::text FROM crop_seasons WHERE tenant_id = $1::uuid AND id = $2::uuid FOR UPDATE`, [input.tenantId, input.cropSeasonId]);
    if (!season.rows[0]) throw new NitrogenRecommendationError("Safra não encontrada.", 404);

    const currentResult = await client.query<ContextRow>(
      `SELECT corn_preceding_class AS "cornPrecedingClass",
              planned_population_plants_per_ha::float8 AS "plannedPopulationPlantsPerHa",
              residue_class AS "residueClass",
              residue_biomass_ton_per_ha::float8 AS "residueBiomassTonPerHa",
              wheat_preceding_crop AS "wheatPrecedingCrop",
              late_quality_n_requested AS "lateQualityNitrogenRequested",
              pasture_type AS "pastureType",
              target_dry_matter_ton_per_ha::float8 AS "targetDryMatterTonPerHa",
              preceding_legume AS "precedingLegume",
              effective_legume_inoculation AS "effectiveLegumeInoculation",
              proven_legume_inoculation_failure AS "provenLegumeInoculationFailure",
              number_of_uses AS "numberOfUses",
              updated_at::text AS "updatedAt"
       FROM nitrogen_recommendation_contexts
       WHERE tenant_id = $1::uuid AND crop_season_id = $2::uuid`,
      [input.tenantId, input.cropSeasonId],
    );
    const current = contextFromRow(currentResult.rows[0]);
    const next: ContextRow = { ...current };

    for (const key of Object.keys(input.patch) as Array<keyof NitrogenContextFields>) {
      if (key === "updatedAt") continue;
      (next as Record<string, unknown>)[key] = input.patch[key] ?? null;
    }
    if (input.patch.lateQualityNitrogenRequested === undefined) next.lateQualityNitrogenRequested = current.lateQualityNitrogenRequested ?? false;
    validateContext(next);

    const comparableKeys: Array<Exclude<keyof ContextRow, "updatedAt">> = [
      "cornPrecedingClass", "plannedPopulationPlantsPerHa", "residueClass", "residueBiomassTonPerHa",
      "wheatPrecedingCrop", "lateQualityNitrogenRequested", "pastureType", "targetDryMatterTonPerHa",
      "precedingLegume", "effectiveLegumeInoculation", "provenLegumeInoculationFailure", "numberOfUses",
    ];
    const changedFields = comparableKeys.filter((key) => !Object.is(current[key], next[key]));
    if (changedFields.length === 0) return current;

    const updated = await client.query<ContextRow>(
      `INSERT INTO nitrogen_recommendation_contexts
       (tenant_id, crop_season_id, corn_preceding_class, planned_population_plants_per_ha, residue_class,
        residue_biomass_ton_per_ha, wheat_preceding_crop, late_quality_n_requested, pasture_type,
        target_dry_matter_ton_per_ha, preceding_legume, effective_legume_inoculation,
        proven_legume_inoculation_failure, number_of_uses, updated_by)
       VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::uuid)
       ON CONFLICT (tenant_id,crop_season_id) DO UPDATE SET
         corn_preceding_class = EXCLUDED.corn_preceding_class,
         planned_population_plants_per_ha = EXCLUDED.planned_population_plants_per_ha,
         residue_class = EXCLUDED.residue_class,
         residue_biomass_ton_per_ha = EXCLUDED.residue_biomass_ton_per_ha,
         wheat_preceding_crop = EXCLUDED.wheat_preceding_crop,
         late_quality_n_requested = EXCLUDED.late_quality_n_requested,
         pasture_type = EXCLUDED.pasture_type,
         target_dry_matter_ton_per_ha = EXCLUDED.target_dry_matter_ton_per_ha,
         preceding_legume = EXCLUDED.preceding_legume,
         effective_legume_inoculation = EXCLUDED.effective_legume_inoculation,
         proven_legume_inoculation_failure = EXCLUDED.proven_legume_inoculation_failure,
         number_of_uses = EXCLUDED.number_of_uses,
         updated_by = EXCLUDED.updated_by,
         updated_at = now()
       RETURNING corn_preceding_class AS "cornPrecedingClass",
                 planned_population_plants_per_ha::float8 AS "plannedPopulationPlantsPerHa",
                 residue_class AS "residueClass",
                 residue_biomass_ton_per_ha::float8 AS "residueBiomassTonPerHa",
                 wheat_preceding_crop AS "wheatPrecedingCrop",
                 late_quality_n_requested AS "lateQualityNitrogenRequested",
                 pasture_type AS "pastureType",
                 target_dry_matter_ton_per_ha::float8 AS "targetDryMatterTonPerHa",
                 preceding_legume AS "precedingLegume",
                 effective_legume_inoculation AS "effectiveLegumeInoculation",
                 proven_legume_inoculation_failure AS "provenLegumeInoculationFailure",
                 number_of_uses AS "numberOfUses",
                 updated_at::text AS "updatedAt"`,
      [
        input.tenantId, input.cropSeasonId, next.cornPrecedingClass, next.plannedPopulationPlantsPerHa,
        next.residueClass, next.residueBiomassTonPerHa, next.wheatPrecedingCrop,
        next.lateQualityNitrogenRequested ?? false, next.pastureType, next.targetDryMatterTonPerHa,
        next.precedingLegume, next.effectiveLegumeInoculation, next.provenLegumeInoculationFailure,
        next.numberOfUses, input.userId,
      ],
    );

    // Contexto de N altera a validade da recomendação da safra. Só tocamos a
    // versão temporal quando houve mudança real, preservando saves idempotentes.
    await client.query(`UPDATE crop_seasons SET updated_at = now() WHERE tenant_id = $1::uuid AND id = $2::uuid`, [input.tenantId, input.cropSeasonId]);

    await writeAudit(client, {
      tenantId: input.tenantId,
      userId: input.userId,
      action: "NITROGEN_RECOMMENDATION_CONTEXT_UPDATED",
      entityType: "crop_season",
      entityId: input.cropSeasonId,
      metadata: { changedFields },
    });

    return updated.rows[0] ?? next;
  });
}

export async function calculateNitrogenRecommendation(input: {
  tenantId: string;
  userId: string;
  analysisId: string;
}) {
  const workspace = await getNitrogenRecommendationWorkspace(input);
  if (!workspace.readiness.ready || !workspace.recommendationPreview) {
    throw new NitrogenRecommendationError("O cálculo de N permanece bloqueado até fechar o contexto técnico.", 422, {
      blockers: workspace.readiness.blockers,
    });
  }

  const recommendation = workspace.recommendationPreview;
  const execution = await recordAgronomicRuleExecution({
    tenantId: input.tenantId,
    userId: input.userId,
    ruleId: recommendation.ruleId,
    analysisId: input.analysisId,
    cropSeasonId: workspace.cropSeasonId,
    runtimeStatus: recommendation.status,
    inputPayload: {
      targetCropRaw: workspace.targetCropRaw,
      targetCropSource: workspace.targetCropSource,
      yieldGoal: workspace.yieldGoal,
      yieldGoalUnit: workspace.yieldGoalUnit,
      seasonUpdatedAt: workspace.seasonUpdatedAt,
      nitrogenContextUpdatedAt: workspace.context.updatedAt,
      organicMatter: workspace.organicMatter,
      organicMatterFingerprint: workspace.organicMatter.fingerprint,
      context: workspace.context,
      normalized: workspace.readiness.normalized,
    },
    outputPayload: recommendation,
  });

  return { recommendation, execution, readiness: workspace.readiness };
}
