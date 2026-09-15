import { withTenant } from "@/lib/db";

export type DecisionDeliveryStatus = {
  analysisId: string;
  prescriptionStatus: "PENDING_REVIEW" | "APPROVED" | "CHANGES_REQUESTED" | "REJECTED" | null;
  prescriptionCreatedAt: string | null;
  reportCount: number;
  latestReportAt: string | null;
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
