import { evaluatePkDoseReadiness } from "@/domain/recommendation-context";
import { MANAGEMENT_SYSTEM_OPTIONS } from "@/domain/management-system";
import { withTenant } from "@/lib/db";
import { writeAudit } from "@/lib/repositories/audit";

export class RecommendationContextError extends Error {
  constructor(message: string, readonly status = 422) {
    super(message);
    this.name = "RecommendationContextError";
  }
}

type RecommendationContextRow = {
  id: string;
  yieldGoal: number | null;
  yieldGoalUnit: string | null;
  technologyLevel: string | null;
  managementSystem: string | null;
  cultivationYears: number | null;
  cultivationOrderAfterSoilAnalysis: number | null;
  cropProfileCode: string | null;
  updatedAt: string;
};

function mapContext(row: RecommendationContextRow) {
  return {
    cropSeasonId: row.id,
    yieldGoal: row.yieldGoal,
    yieldGoalUnit: row.yieldGoalUnit,
    technologyLevel: row.technologyLevel,
    managementSystem: row.managementSystem,
    cultivationYears: row.cultivationYears,
    cultivationOrderAfterSoilAnalysis: row.cultivationOrderAfterSoilAnalysis,
    cropProfileCode: row.cropProfileCode,
    updatedAt: row.updatedAt,
    pkDoseReadiness: evaluatePkDoseReadiness({
      yieldGoal: row.yieldGoal,
      yieldGoalUnit: row.yieldGoalUnit,
      cultivationOrderAfterSoilAnalysis: row.cultivationOrderAfterSoilAnalysis,
    }),
  };
}

const SELECT_CONTEXT = `
  SELECT cs.id::text,
         cs.yield_goal::float8 AS "yieldGoal",
         cs.yield_goal_unit AS "yieldGoalUnit",
         cs.technology_level AS "technologyLevel",
         cs.management_system AS "managementSystem",
         cs.cultivation_years AS "cultivationYears",
         cs.cultivation_order_after_soil_analysis AS "cultivationOrderAfterSoilAnalysis",
         cp.code AS "cropProfileCode",
         cs.updated_at::text AS "updatedAt"
  FROM crop_seasons cs
  LEFT JOIN crop_profiles cp ON cp.id = cs.crop_profile_id
  WHERE cs.tenant_id = $1::uuid AND cs.id = $2::uuid
`;

export async function getRecommendationContext(input: {
  tenantId: string;
  userId: string;
  cropSeasonId: string;
}) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const result = await client.query<RecommendationContextRow>(SELECT_CONTEXT, [input.tenantId, input.cropSeasonId]);
    const row = result.rows[0];
    if (!row) throw new RecommendationContextError("Safra não encontrada.", 404);
    return mapContext(row);
  });
}

export async function getRecommendationContextByAnalysis(input: {
  tenantId: string;
  userId: string;
  analysisId: string;
}) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const result = await client.query<RecommendationContextRow>(
      `SELECT cs.id::text,
              cs.yield_goal::float8 AS "yieldGoal",
              cs.yield_goal_unit AS "yieldGoalUnit",
              cs.technology_level AS "technologyLevel",
              cs.management_system AS "managementSystem",
              cs.cultivation_years AS "cultivationYears",
              cs.cultivation_order_after_soil_analysis AS "cultivationOrderAfterSoilAnalysis",
              cp.code AS "cropProfileCode",
              cs.updated_at::text AS "updatedAt"
       FROM analyses a
       JOIN crop_seasons cs ON cs.tenant_id = a.tenant_id AND cs.id = a.crop_season_id
       LEFT JOIN crop_profiles cp ON cp.id = cs.crop_profile_id
       WHERE a.tenant_id = $1::uuid AND a.id = $2::uuid
       LIMIT 1`,
      [input.tenantId, input.analysisId],
    );
    const row = result.rows[0];
    if (!row) throw new RecommendationContextError("Análise não encontrada.", 404);
    return mapContext(row);
  });
}

export async function updateRecommendationContext(input: {
  tenantId: string;
  userId: string;
  cropSeasonId: string;
  yieldGoal?: number | null;
  yieldGoalUnit?: string | null;
  cultivationOrderAfterSoilAnalysis?: number | null;
  managementSystem?: string | null;
}) {
  if (input.yieldGoal !== undefined && input.yieldGoal !== null && (!Number.isFinite(input.yieldGoal) || input.yieldGoal <= 0)) {
    throw new RecommendationContextError("Meta produtiva deve ser maior que zero.", 400);
  }
  if (
    input.cultivationOrderAfterSoilAnalysis !== undefined
    && input.cultivationOrderAfterSoilAnalysis !== null
    && (!Number.isInteger(input.cultivationOrderAfterSoilAnalysis) || input.cultivationOrderAfterSoilAnalysis < 1)
  ) {
    throw new RecommendationContextError("Ordem de cultivo após a análise deve ser um inteiro maior ou igual a 1.", 400);
  }

  if (input.managementSystem !== undefined && input.managementSystem !== null) {
    const allowed = new Set(MANAGEMENT_SYSTEM_OPTIONS.map((option) => option.value));
    if (!allowed.has(input.managementSystem as (typeof MANAGEMENT_SYSTEM_OPTIONS)[number]["value"])) {
      throw new RecommendationContextError("Sistema de manejo informado não é suportado.", 400);
    }
  }

  if (
    input.yieldGoal === undefined
    && input.yieldGoalUnit === undefined
    && input.cultivationOrderAfterSoilAnalysis === undefined
    && input.managementSystem === undefined
  ) {
    throw new RecommendationContextError("Nenhum campo de contexto de recomendação foi informado.", 400);
  }

  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const currentResult = await client.query<RecommendationContextRow>(
      `${SELECT_CONTEXT} FOR UPDATE OF cs`,
      [input.tenantId, input.cropSeasonId],
    );
    const current = currentResult.rows[0];
    if (!current) throw new RecommendationContextError("Safra não encontrada.", 404);

    const nextYieldGoal = input.yieldGoal === undefined ? current.yieldGoal : input.yieldGoal;
    const nextYieldGoalUnit = input.yieldGoalUnit === undefined ? current.yieldGoalUnit : (input.yieldGoalUnit?.trim() || null);
    const nextCultivationOrder = input.cultivationOrderAfterSoilAnalysis === undefined
      ? current.cultivationOrderAfterSoilAnalysis
      : input.cultivationOrderAfterSoilAnalysis;
    const nextManagementSystem = input.managementSystem === undefined
      ? current.managementSystem
      : (input.managementSystem?.trim() || null);

    const changedFields: string[] = [];
    if (nextYieldGoal !== current.yieldGoal) changedFields.push("yieldGoal");
    if (nextYieldGoalUnit !== current.yieldGoalUnit) changedFields.push("yieldGoalUnit");
    if (nextCultivationOrder !== current.cultivationOrderAfterSoilAnalysis) changedFields.push("cultivationOrderAfterSoilAnalysis");
    if (nextManagementSystem !== current.managementSystem) changedFields.push("managementSystem");

    if (changedFields.length === 0) return mapContext(current);

    const updated = await client.query<Omit<RecommendationContextRow, "cropProfileCode">>(
      `UPDATE crop_seasons
       SET yield_goal = $3::numeric,
           yield_goal_unit = $4::text,
           cultivation_order_after_soil_analysis = $5::integer,
           management_system = $6::text,
           updated_at = now()
       WHERE tenant_id = $1::uuid AND id = $2::uuid
       RETURNING id::text,
                 yield_goal::float8 AS "yieldGoal",
                 yield_goal_unit AS "yieldGoalUnit",
                 technology_level AS "technologyLevel",
                 management_system AS "managementSystem",
                 cultivation_years AS "cultivationYears",
                 cultivation_order_after_soil_analysis AS "cultivationOrderAfterSoilAnalysis",
                 updated_at::text AS "updatedAt"`,
      [input.tenantId, input.cropSeasonId, nextYieldGoal, nextYieldGoalUnit, nextCultivationOrder, nextManagementSystem],
    );

    const row = updated.rows[0];
    if (!row) throw new RecommendationContextError("Safra não encontrada.", 404);

    const context = mapContext({ ...row, cropProfileCode: current.cropProfileCode });
    await writeAudit(client, {
      tenantId: input.tenantId,
      userId: input.userId,
      action: "CROP_SEASON_RECOMMENDATION_CONTEXT_UPDATED",
      entityType: "crop_season",
      entityId: input.cropSeasonId,
      metadata: {
        changedFields,
        pkDoseReady: context.pkDoseReadiness.ready,
        blockers: context.pkDoseReadiness.blockers,
        managementSystem: context.managementSystem,
      },
    });

    return context;
  });
}
