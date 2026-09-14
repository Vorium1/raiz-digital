import { evaluateOfficialRecommendationFreshness, type OfficialRecommendationSourceKind } from "@/domain/official-recommendation-freshness";
import { withTenant } from "@/lib/db";

export type InputComparisonStatus = "OK" | "UNDER" | "OVER" | "UNIT_MISMATCH" | "NOT_APPLIED" | "STALE_RECOMMENDATION";

/**
 * Compara recomendado × usado sem transformar recomendação histórica em baseline atual.
 *
 * A última linha promovida de cada insumo continua visível para rastreabilidade, porém uma recomendação
 * originada por IA só é comparável quando sua geração ainda é APPROVED, foi criada com o contexto atual
 * da safra e continua vinculada à interpretação determinística APPROVED mais recente. Caso contrário,
 * a UI recebe STALE_RECOMMENDATION e NÃO classifica a aplicação como abaixo/acima/conforme.
 */
export async function getCurrentInputComparisonForAnalysis(tenantId: string, analysisId: string, userId?: string) {
  return withTenant({ tenantId, userId }, async (client) => {
    const result = await client.query<{
      inputType: string;
      recommendedQuantity: number;
      recommendedUnit: string;
      calculationSource: string | null;
      recommendedAt: string;
      sourceGenerationId: string | null;
      sourceKind: OfficialRecommendationSourceKind;
      generationStatus: string | null;
      generationCreatedAt: string | null;
      generationInterpretationId: string | null;
      cropSeasonUpdatedAt: string;
      latestInterpretationId: string | null;
      latestInterpretationStatus: string | null;
      appliedQuantity: number | null;
      appliedUnit: string | null;
      hasAnyApplication: boolean;
    }>(
      `WITH latest_recommendations AS (
         SELECT DISTINCT ON (ir.input_type)
                ir.input_type, ir.quantity, ir.unit, ir.calculation_source, ir.calculated_at,
                ir.source_generation_id
         FROM input_recommendations ir
         WHERE ir.tenant_id = $1::uuid AND ir.analysis_id = $2::uuid
         ORDER BY ir.input_type, ir.calculated_at DESC, ir.id DESC
       ),
       applied_totals AS (
         SELECT input_type, unit, SUM(quantity) AS total_quantity
         FROM input_applications
         WHERE tenant_id = $1::uuid AND analysis_id = $2::uuid
         GROUP BY input_type, unit
       ),
       any_applied AS (
         SELECT DISTINCT input_type
         FROM input_applications
         WHERE tenant_id = $1::uuid AND analysis_id = $2::uuid
       )
       SELECT r.input_type AS "inputType",
              r.quantity::float8 AS "recommendedQuantity",
              r.unit AS "recommendedUnit",
              r.calculation_source AS "calculationSource",
              r.calculated_at::text AS "recommendedAt",
              r.source_generation_id::text AS "sourceGenerationId",
              CASE
                WHEN r.source_generation_id IS NOT NULL THEN 'AI'
                WHEN r.calculation_source LIKE 'ai_generations:%' THEN 'UNRESOLVED_AI'
                ELSE 'NON_AI'
              END AS "sourceKind",
              g.status::text AS "generationStatus",
              g.created_at::text AS "generationCreatedAt",
              g.interpretation_id::text AS "generationInterpretationId",
              cs.updated_at::text AS "cropSeasonUpdatedAt",
              li.id::text AS "latestInterpretationId",
              li.status::text AS "latestInterpretationStatus",
              a.total_quantity::float8 AS "appliedQuantity",
              a.unit AS "appliedUnit",
              (aa.input_type IS NOT NULL) AS "hasAnyApplication"
       FROM latest_recommendations r
       JOIN analyses an ON an.tenant_id = $1::uuid AND an.id = $2::uuid
       JOIN crop_seasons cs ON cs.tenant_id = an.tenant_id AND cs.id = an.crop_season_id
       LEFT JOIN ai_generations g
         ON g.tenant_id = $1::uuid AND g.id = r.source_generation_id AND g.kind = 'AGRONOMIC_PRESCRIPTION'
       LEFT JOIN LATERAL (
         SELECT i.id, i.status
         FROM interpretations i
         WHERE i.tenant_id = an.tenant_id AND i.analysis_id = an.id
         ORDER BY i.revision DESC
         LIMIT 1
       ) li ON true
       LEFT JOIN applied_totals a ON a.input_type = r.input_type AND a.unit = r.unit
       LEFT JOIN any_applied aa ON aa.input_type = r.input_type
       ORDER BY r.input_type`,
      [tenantId, analysisId],
    );

    return result.rows.map((row) => {
      const freshness = evaluateOfficialRecommendationFreshness({
        sourceKind: row.sourceKind,
        generationStatus: row.generationStatus,
        generationCreatedAt: row.generationCreatedAt,
        cropSeasonUpdatedAt: row.cropSeasonUpdatedAt,
        generationInterpretationId: row.generationInterpretationId,
        latestInterpretationId: row.latestInterpretationId,
        latestInterpretationStatus: row.latestInterpretationStatus,
      });

      let status: InputComparisonStatus;
      if (!freshness.current) {
        status = "STALE_RECOMMENDATION";
      } else if (row.appliedQuantity != null) {
        const ratio = row.appliedQuantity / row.recommendedQuantity;
        status = ratio < 0.95 ? "UNDER" : ratio > 1.1 ? "OVER" : "OK";
      } else if (row.hasAnyApplication) {
        status = "UNIT_MISMATCH";
      } else {
        status = "NOT_APPLIED";
      }

      return {
        inputType: row.inputType,
        recommendedQuantity: row.recommendedQuantity,
        recommendedUnit: row.recommendedUnit,
        calculationSource: row.calculationSource,
        recommendedAt: row.recommendedAt,
        sourceGenerationId: row.sourceGenerationId,
        appliedQuantity: row.appliedQuantity,
        appliedUnit: row.appliedUnit,
        hasAnyApplication: row.hasAnyApplication,
        recommendationCurrent: freshness.current,
        recommendationCurrentCode: freshness.code,
        recommendationCurrentReason: freshness.reason,
        status,
      };
    });
  });
}
