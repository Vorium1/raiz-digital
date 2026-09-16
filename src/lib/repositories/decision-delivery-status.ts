import { evaluateAnalysisEvidenceFreshness } from "@/domain/analysis-evidence-freshness";
import { withTenant } from "@/lib/db";

export type DecisionDeliveryStatus = {
  analysisId: string;
  prescriptionStatus: "PENDING_REVIEW" | "APPROVED" | "CHANGES_REQUESTED" | "REJECTED" | null;
  prescriptionCreatedAt: string | null;
  interpretationCurrent: boolean;
  interpretationStaleReason: string | null;
  prescriptionCurrent: boolean;
  reportCount: number;
  latestReportAt: string | null;
  currentReportCount: number;
  latestCurrentReportAt: string | null;
};

/**
 * Estado de entrega por análise, sem criar um novo status artificial no banco. Consolida as etapas
 * posteriores à interpretação e separa histórico de estado CORRENTE: novo laudo torna interpretação,
 * prescrição e relatórios anteriores históricos, sem apagá-los nem fingir que a decisão continua válida.
 */
export async function getDecisionDeliveryStatuses(tenantId: string, analysisIds: string[], userId?: string): Promise<DecisionDeliveryStatus[]> {
  if (analysisIds.length === 0) return [];
  return withTenant({ tenantId, userId }, async (client) => {
    const result = await client.query<{
      analysisId: string;
      cropSeasonUpdatedAt: string;
      latestInterpretationId: string | null;
      latestInterpretationCreatedAt: string | null;
      latestImportCommittedAt: string | null;
      prescriptionStatus: DecisionDeliveryStatus["prescriptionStatus"];
      prescriptionCreatedAt: string | null;
      prescriptionInterpretationId: string | null;
      reportCount: number;
      latestReportAt: string | null;
      latestInterpretationReportCount: number;
      latestInterpretationReportAt: string | null;
    }>(
      `SELECT a.id::text AS "analysisId",
              cs.updated_at::text AS "cropSeasonUpdatedAt",
              latest_i.id::text AS "latestInterpretationId",
              latest_i.created_at::text AS "latestInterpretationCreatedAt",
              latest_import.latest_import_at::text AS "latestImportCommittedAt",
              prescription.status::text AS "prescriptionStatus",
              prescription.created_at::text AS "prescriptionCreatedAt",
              prescription.interpretation_id::text AS "prescriptionInterpretationId",
              coalesce(report_stats.report_count,0)::int AS "reportCount",
              report_stats.latest_report_at::text AS "latestReportAt",
              coalesce(current_report_stats.report_count,0)::int AS "latestInterpretationReportCount",
              current_report_stats.latest_report_at::text AS "latestInterpretationReportAt"
       FROM analyses a
       JOIN crop_seasons cs ON cs.tenant_id=a.tenant_id AND cs.id=a.crop_season_id
       LEFT JOIN LATERAL (
         SELECT i.id, i.created_at
         FROM interpretations i
         WHERE i.tenant_id=a.tenant_id AND i.analysis_id=a.id
         ORDER BY i.revision DESC
         LIMIT 1
       ) latest_i ON true
       LEFT JOIN LATERAL (
         SELECT max(coalesce(ai.committed_at, ai.created_at)) AS latest_import_at
         FROM analysis_imports ai
         WHERE ai.tenant_id=a.tenant_id AND ai.analysis_id=a.id
       ) latest_import ON true
       LEFT JOIN LATERAL (
         SELECT ag.status, ag.created_at, ag.interpretation_id
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
       LEFT JOIN LATERAL (
         SELECT count(*)::int AS report_count, max(r.published_at) AS latest_report_at
         FROM reports r
         WHERE r.tenant_id=a.tenant_id AND r.interpretation_id=latest_i.id
       ) current_report_stats ON true
       WHERE a.tenant_id=$1::uuid AND a.id=ANY($2::uuid[])`,
      [tenantId, analysisIds],
    );

    return result.rows.map((row) => {
      const interpretationFreshness = row.latestInterpretationId
        ? evaluateAnalysisEvidenceFreshness({
            interpretationCreatedAt: row.latestInterpretationCreatedAt,
            latestImportCommittedAt: row.latestImportCommittedAt,
          })
        : { current: false, reason: null };
      const prescriptionCurrent = Boolean(
        interpretationFreshness.current
        && row.prescriptionInterpretationId
        && row.prescriptionInterpretationId === row.latestInterpretationId
        && row.prescriptionCreatedAt
        && new Date(row.prescriptionCreatedAt).getTime() >= new Date(row.cropSeasonUpdatedAt).getTime(),
      );
      const currentReportCount = interpretationFreshness.current ? row.latestInterpretationReportCount : 0;

      return {
        analysisId: row.analysisId,
        prescriptionStatus: row.prescriptionStatus,
        prescriptionCreatedAt: row.prescriptionCreatedAt,
        interpretationCurrent: interpretationFreshness.current,
        interpretationStaleReason: interpretationFreshness.current ? null : interpretationFreshness.reason,
        prescriptionCurrent,
        reportCount: row.reportCount,
        latestReportAt: row.latestReportAt,
        currentReportCount,
        latestCurrentReportAt: currentReportCount > 0 ? row.latestInterpretationReportAt : null,
      };
    });
  });
}
