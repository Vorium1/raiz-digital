import { evaluatePkDoseReadiness } from "@/domain/recommendation-context";
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
  cultivationYears: number | null;
  cultivationOrderAfterSoilAnalysis: number | null;
  updatedAt: string;
};

function mapContext(row: RecommendationContextRow) {
  return {
    cropSeasonId: row.id,
    yieldGoal: row.yieldGoal,
    yieldGoalUnit: row.yieldGoalUnit,
    technologyLevel: row.technologyLevel,
    cultivationYears: row.cultivationYears,
    cultivationOrderAfterSoilAnalysis: row.cultivationOrderAfterSoilAnalysis,
    updatedAt: row.updatedAt,
    pkDoseReadiness: evaluatePkDoseReadiness({
      yieldGoal: row.yieldGoal,
      yieldGoalUnit: row.yieldGoalUnit,
      cultivationOrderAfterSoilAnalysis: row.cultivationOrderAfterSoilAnalysis,
    }),
  };
}

const SELECT_CONTEXT = `
  SELECT id::text,
         yield_goal::float8 AS "yieldGoal",
         yield_goal_unit AS "yieldGoalUnit",
         technology_level AS "technologyLevel",
         cultivation_years AS "cultivationYears",
         cultivation_order_after_soil_analysis AS "cultivationOrderAfterSoilAnalysis",
         updated_at::text AS "updatedAt"
  FROM crop_seasons
  WHERE tenant_id = $1::uuid AND id = $2::uuid
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

/**
 * Leitura leve do contexto a partir de uma análise. Evita reconstruir todo o pacote de evidências da IA
 * só para a interface explicar por que P/K ainda está ou não pronto para dose quantitativa.
 */
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
              cs.cultivation_years AS "cultivationYears",
              cs.cultivation_order_after_soil_analysis AS "cultivationOrderAfterSoilAnalysis",
              cs.updated_at::text AS "updatedAt"
       FROM analyses a
       JOIN crop_seasons cs ON cs.tenant_id = a.tenant_id AND cs.id = a.crop_season_id
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

  if (input.yieldGoal === undefined && input.yieldGoalUnit === undefined && input.cultivationOrderAfterSoilAnalysis === undefined) {
    throw new RecommendationContextError("Nenhum campo de contexto de recomendação foi informado.", 400);
  }

  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const currentResult = await client.query<RecommendationContextRow>(
      `${SELECT_CONTEXT} FOR UPDATE`,
      [input.tenantId, input.cropSeasonId],
    );
    const current = currentResult.rows[0];
    if (!current) throw new RecommendationContextError("Safra não encontrada.", 404);

    const nextYieldGoal = input.yieldGoal === undefined ? current.yieldGoal : input.yieldGoal;
    const nextYieldGoalUnit = input.yieldGoalUnit === undefined ? current.yieldGoalUnit : (input.yieldGoalUnit?.trim() || null);
    const nextCultivationOrder = input.cultivationOrderAfterSoilAnalysis === undefined
      ? current.cultivationOrderAfterSoilAnalysis
      : input.cultivationOrderAfterSoilAnalysis;

    const changedFields: string[] = [];
    if (nextYieldGoal !== current.yieldGoal) changedFields.push("yieldGoal");
    if (nextYieldGoalUnit !== current.yieldGoalUnit) changedFields.push("yieldGoalUnit");
    if (nextCultivationOrder !== current.cultivationOrderAfterSoilAnalysis) changedFields.push("cultivationOrderAfterSoilAnalysis");

    // Salvar exatamente o mesmo contexto não cria uma "mudança" artificial nem invalida uma prescrição
    // já gerada. A versão temporal só avança quando o conteúdo agronômico realmente muda.
    if (changedFields.length === 0) return mapContext(current);

    const updated = await client.query<RecommendationContextRow>(
      `UPDATE crop_seasons
       SET yield_goal = $3::numeric,
           yield_goal_unit = $4::text,
           cultivation_order_after_soil_analysis = $5::integer,
           updated_at = now()
       WHERE tenant_id = $1::uuid AND id = $2::uuid
       RETURNING id::text,
                 yield_goal::float8 AS "yieldGoal",
                 yield_goal_unit AS "yieldGoalUnit",
                 technology_level AS "technologyLevel",
                 cultivation_years AS "cultivationYears",
                 cultivation_order_after_soil_analysis AS "cultivationOrderAfterSoilAnalysis",
                 updated_at::text AS "updatedAt"`,
      [input.tenantId, input.cropSeasonId, nextYieldGoal, nextYieldGoalUnit, nextCultivationOrder],
    );

    const row = updated.rows[0];
    if (!row) throw new RecommendationContextError("Safra não encontrada.", 404);

    const context = mapContext(row);
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
      },
    });

    return context;
  });
}
