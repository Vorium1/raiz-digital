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
};

function mapContext(row: RecommendationContextRow) {
  return {
    cropSeasonId: row.id,
    yieldGoal: row.yieldGoal,
    yieldGoalUnit: row.yieldGoalUnit,
    technologyLevel: row.technologyLevel,
    cultivationYears: row.cultivationYears,
    cultivationOrderAfterSoilAnalysis: row.cultivationOrderAfterSoilAnalysis,
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
         cultivation_order_after_soil_analysis AS "cultivationOrderAfterSoilAnalysis"
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

  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const assignments: string[] = [];
    const values: unknown[] = [input.tenantId, input.cropSeasonId];

    if (input.yieldGoal !== undefined) {
      values.push(input.yieldGoal);
      assignments.push(`yield_goal = $${values.length}::numeric`);
    }
    if (input.yieldGoalUnit !== undefined) {
      values.push(input.yieldGoalUnit?.trim() || null);
      assignments.push(`yield_goal_unit = $${values.length}::text`);
    }
    if (input.cultivationOrderAfterSoilAnalysis !== undefined) {
      values.push(input.cultivationOrderAfterSoilAnalysis);
      assignments.push(`cultivation_order_after_soil_analysis = $${values.length}::integer`);
    }

    if (!assignments.length) {
      throw new RecommendationContextError("Nenhum campo de contexto de recomendação foi informado.", 400);
    }

    const updated = await client.query<RecommendationContextRow>(
      `UPDATE crop_seasons
       SET ${assignments.join(", ")}, updated_at = now()
       WHERE tenant_id = $1::uuid AND id = $2::uuid
       RETURNING id::text,
                 yield_goal::float8 AS "yieldGoal",
                 yield_goal_unit AS "yieldGoalUnit",
                 technology_level AS "technologyLevel",
                 cultivation_years AS "cultivationYears",
                 cultivation_order_after_soil_analysis AS "cultivationOrderAfterSoilAnalysis"`,
      values,
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
        changedFields: [
          input.yieldGoal !== undefined ? "yieldGoal" : null,
          input.yieldGoalUnit !== undefined ? "yieldGoalUnit" : null,
          input.cultivationOrderAfterSoilAnalysis !== undefined ? "cultivationOrderAfterSoilAnalysis" : null,
        ].filter(Boolean),
        pkDoseReady: context.pkDoseReadiness.ready,
        blockers: context.pkDoseReadiness.blockers,
      },
    });

    return context;
  });
}
