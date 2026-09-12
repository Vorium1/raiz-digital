import { withTenant } from "@/lib/db";

export type DecisionDeliveryStatus = {
  analysisId: string;
  prescriptionStatus: "PENDING_REVIEW" | "APPROVED" | "CHANGES_REQUESTED" | "REJECTED" | null;
  prescriptionCreatedAt: string | null;
  reportCount: number;
  latestReportAt: string | null;
};

export type DecisionPortfolioFunnel = {
  totalAnalyses: number;
  interpreted: number;
  interpretationsApproved: number;
  prescriptionsInReview: number;
  prescriptionsApproved: number;
  reportsPublished: number;
};

export type DecisionPortfolioFilters = {
  clientId?: string | null;
  propertyId?: string | null;
  cropSeasonId?: string | null;
};

/**
 * Estado de entrega por análise, sem criar um novo status artificial no banco. Consolida as duas etapas
 * posteriores à interpretação que já existem de verdade: recomendação assistida (`ai_generations`) e
 * relatório publicado (`reports`). Usado pela Central de Decisões para mostrar "o que vem agora" sem o
 * cliente precisar descobrir manualmente cinco telas diferentes.
 */
export async function getDecisionDeliveryStatuses(tenantId: string, analysisIds: string[], userId?: string): Promise<DecisionDeliveryStatus[]> {
  if (analysisIds.length === 0) return [];
  return withTenant({ tenantId, userId }, async (client) => {
    const result = await client.query<DecisionDeliveryStatus>(
      `SELECT a.id::text AS "analysisId",
              prescription.status::text AS "prescriptionStatus",
              prescription.created_at::text AS "prescriptionCreatedAt",
              coalesce(report_stats.report_count,0)::int AS "reportCount",
              report_stats.latest_report_at::text AS "latestReportAt"
       FROM analyses a
       LEFT JOIN LATERAL (
         SELECT ag.status, ag.created_at
         FROM ai_generations ag
         WHERE ag.tenant_id=a.tenant_id
           AND ag.analysis_id=a.id
           AND ag.kind='AGRONOMIC_PRESCRIPTION'
         ORDER BY ag.created_at DESC
         LIMIT 1
       ) prescription ON true
       LEFT JOIN LATERAL (
         SELECT count(*)::int AS report_count, max(r.published_at) AS latest_report_at
         FROM interpretations i
         JOIN reports r ON r.tenant_id=i.tenant_id AND r.interpretation_id=i.id
         WHERE i.tenant_id=a.tenant_id AND i.analysis_id=a.id
       ) report_stats ON true
       WHERE a.tenant_id=$1::uuid AND a.id=ANY($2::uuid[])`,
      [tenantId, analysisIds],
    );
    return result.rows;
  });
}

/**
 * Funil executivo da decisão. Diferente da lista de análises recentes, esta consulta agrega TODA a
 * carteira dentro do filtro selecionado e, portanto, pode ser usada como KPI comercial/operacional sem
 * confundir "últimas 200 linhas" com o portfólio completo. Cada etapa deriva apenas de registros reais:
 * interpretação persistida, aprovação profissional, geração/revisão de recomendação e publish de relatório.
 */
export async function getDecisionPortfolioFunnel(
  tenantId: string,
  filters: DecisionPortfolioFilters = {},
  userId?: string,
): Promise<DecisionPortfolioFunnel> {
  return withTenant({ tenantId, userId }, async (client) => {
    const result = await client.query<DecisionPortfolioFunnel>(
      `WITH scoped AS (
         SELECT a.id, a.tenant_id,
                latest_interpretation.status::text AS interpretation_status
         FROM analyses a
         JOIN crop_seasons cs ON cs.tenant_id=a.tenant_id AND cs.id=a.crop_season_id
         JOIN fields f ON f.tenant_id=cs.tenant_id AND f.id=cs.field_id
         JOIN properties p ON p.tenant_id=f.tenant_id AND p.id=f.property_id
         LEFT JOIN LATERAL (
           SELECT i.status
           FROM interpretations i
           WHERE i.tenant_id=a.tenant_id AND i.analysis_id=a.id
           ORDER BY i.revision DESC
           LIMIT 1
         ) latest_interpretation ON true
         WHERE a.tenant_id=$1::uuid
           AND ($2::uuid IS NULL OR p.client_id=$2::uuid)
           AND ($3::uuid IS NULL OR p.id=$3::uuid)
           AND ($4::uuid IS NULL OR cs.id=$4::uuid)
       ), decision_state AS (
         SELECT s.*,
                latest_prescription.status::text AS prescription_status,
                EXISTS (
                  SELECT 1
                  FROM interpretations ri
                  JOIN reports r ON r.tenant_id=ri.tenant_id AND r.interpretation_id=ri.id
                  WHERE ri.tenant_id=s.tenant_id AND ri.analysis_id=s.id
                ) AS has_published_report
         FROM scoped s
         LEFT JOIN LATERAL (
           SELECT ag.status
           FROM ai_generations ag
           WHERE ag.tenant_id=s.tenant_id
             AND ag.analysis_id=s.id
             AND ag.kind='AGRONOMIC_PRESCRIPTION'
           ORDER BY ag.created_at DESC
           LIMIT 1
         ) latest_prescription ON true
       )
       SELECT count(*)::int AS "totalAnalyses",
              count(*) FILTER (WHERE interpretation_status IS NOT NULL)::int AS "interpreted",
              count(*) FILTER (WHERE interpretation_status IN ('APPROVED','PUBLISHED'))::int AS "interpretationsApproved",
              count(*) FILTER (WHERE prescription_status='PENDING_REVIEW')::int AS "prescriptionsInReview",
              count(*) FILTER (WHERE prescription_status='APPROVED')::int AS "prescriptionsApproved",
              count(*) FILTER (WHERE has_published_report)::int AS "reportsPublished"
       FROM decision_state`,
      [tenantId, filters.clientId ?? null, filters.propertyId ?? null, filters.cropSeasonId ?? null],
    );
    return result.rows[0] ?? {
      totalAnalyses: 0,
      interpreted: 0,
      interpretationsApproved: 0,
      prescriptionsInReview: 0,
      prescriptionsApproved: 0,
      reportsPublished: 0,
    };
  });
}
