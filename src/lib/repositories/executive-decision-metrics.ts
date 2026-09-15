import { withTenant } from "@/lib/db";

export type ExecutiveDecisionFilters = {
  clientId?: string;
  propertyId?: string;
  fieldId?: string;
  seasonId?: string;
};

export type ExecutiveDecisionMetrics = {
  totalAnalyses: number;
  blockedInterpretations: number;
  awaitingInterpretationReview: number;
  approvedInterpretations: number;
  readyForRecommendation: number;
  recommendationsInReview: number;
  recommendationsApproved: number;
  readyForPublication: number;
  deliveredAnalyses: number;
  avgDaysToDelivery: number | null;
};

/**
 * Métricas de valor operacional do ciclo completo da decisão agronômica.
 * Não cria novos estados: deriva somente de análises, última interpretação,
 * última recomendação assistida e relatórios realmente publicados.
 */
export async function getExecutiveDecisionMetrics(
  tenantId: string,
  filters: ExecutiveDecisionFilters,
  userId?: string,
): Promise<ExecutiveDecisionMetrics> {
  return withTenant({ tenantId, userId }, async (client) => {
    const result = await client.query<ExecutiveDecisionMetrics>(
      `WITH scoped AS (
         SELECT a.id, a.created_at,
                li.status AS interpretation_status,
                li.not_interpretable_reason,
                lp.status AS prescription_status,
                rs.report_count,
                rs.latest_report_at
         FROM analyses a
         JOIN crop_seasons cs ON cs.tenant_id=a.tenant_id AND cs.id=a.crop_season_id
         JOIN fields f ON f.tenant_id=cs.tenant_id AND f.id=cs.field_id
         JOIN properties p ON p.tenant_id=f.tenant_id AND p.id=f.property_id
         LEFT JOIN LATERAL (
           SELECT i.status, i.not_interpretable_reason
           FROM interpretations i
           WHERE i.tenant_id=a.tenant_id AND i.analysis_id=a.id
           ORDER BY i.revision DESC
           LIMIT 1
         ) li ON true
         LEFT JOIN LATERAL (
           SELECT ag.status
           FROM ai_generations ag
           WHERE ag.tenant_id=a.tenant_id
             AND ag.analysis_id=a.id
             AND ag.kind::text='AGRONOMIC_PRESCRIPTION'
           ORDER BY ag.created_at DESC
           LIMIT 1
         ) lp ON true
         LEFT JOIN LATERAL (
           SELECT count(*)::int AS report_count, max(r.published_at) AS latest_report_at
           FROM interpretations i
           JOIN reports r ON r.tenant_id=i.tenant_id AND r.interpretation_id=i.id
           WHERE i.tenant_id=a.tenant_id AND i.analysis_id=a.id
         ) rs ON true
         WHERE a.tenant_id=$1::uuid
           AND ($2::uuid IS NULL OR p.client_id=$2::uuid)
           AND ($3::uuid IS NULL OR p.id=$3::uuid)
           AND ($4::uuid IS NULL OR f.id=$4::uuid)
           AND ($5::uuid IS NULL OR cs.id=$5::uuid)
       )
       SELECT
         count(*)::int AS "totalAnalyses",
         count(*) FILTER (WHERE interpretation_status='CALCULATED' AND not_interpretable_reason IS NOT NULL)::int AS "blockedInterpretations",
         count(*) FILTER (WHERE interpretation_status='IN_REVIEW')::int AS "awaitingInterpretationReview",
         count(*) FILTER (WHERE interpretation_status='APPROVED')::int AS "approvedInterpretations",
         count(*) FILTER (WHERE interpretation_status='APPROVED' AND prescription_status IS NULL)::int AS "readyForRecommendation",
         count(*) FILTER (WHERE prescription_status='PENDING_REVIEW')::int AS "recommendationsInReview",
         count(*) FILTER (WHERE prescription_status='APPROVED')::int AS "recommendationsApproved",
         count(*) FILTER (WHERE prescription_status='APPROVED' AND coalesce(report_count,0)=0)::int AS "readyForPublication",
         count(*) FILTER (WHERE coalesce(report_count,0)>0)::int AS "deliveredAnalyses",
         avg(EXTRACT(EPOCH FROM (latest_report_at-created_at))/86400.0) FILTER (WHERE latest_report_at IS NOT NULL)::float8 AS "avgDaysToDelivery"
       FROM scoped`,
      [tenantId, filters.clientId ?? null, filters.propertyId ?? null, filters.fieldId ?? null, filters.seasonId ?? null],
    );
    return result.rows[0];
  });
}
