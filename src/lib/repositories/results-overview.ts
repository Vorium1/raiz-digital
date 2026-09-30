import { evaluateAnalysisEvidenceFreshness } from "@/domain/analysis-evidence-freshness";
import { evaluateOfficialResultCompleteness, officialResultCompletenessReason } from "@/domain/official-result-completeness";
import type { DecisionDeliveryStatus } from "@/lib/repositories/decision-delivery-status";
import { withTenant } from "@/lib/db";

type ResultsAnalysisRow = {
  id: string;
  code: string;
  status: string;
  confidenceScore: number | null;
  requestedAnalysisDepth: string | null;
  createdAt: string;
  updatedAt: string;
  clientName: string;
  propertyName: string;
  fieldName: string;
  areaHa: number;
  seasonLabel: string;
  currentCrop: string | null;
  nextCrop: string | null;
  latestInterpretationStatus: string | null;
  notInterpretableReason: string | null;
  cropSeasonUpdatedAt: string;
  latestInterpretationId: string | null;
  latestInterpretationCreatedAt: string | null;
  latestInterpretationCropProfileId: string | null;
  currentCropProfileId: string | null;
  latestImportCommittedAt: string | null;
  latestRuleUpdatedAt: string | null;
  prescriptionId: string | null;
  prescriptionStatus: DecisionDeliveryStatus["prescriptionStatus"];
  prescriptionCreatedAt: string | null;
  prescriptionInterpretationId: string | null;
  prescriptionResponsePayload: unknown;
  reportCount: number;
  latestReportAt: string | null;
  latestDecisionReportCount: number;
  latestDecisionReportAt: string | null;
};

export type ResultsOverviewAnalysis = Omit<ResultsAnalysisRow,
  | "cropSeasonUpdatedAt"
  | "latestInterpretationId"
  | "latestInterpretationCreatedAt"
  | "latestInterpretationCropProfileId"
  | "currentCropProfileId"
  | "latestImportCommittedAt"
  | "latestRuleUpdatedAt"
  | "prescriptionId"
  | "prescriptionStatus"
  | "prescriptionCreatedAt"
  | "prescriptionInterpretationId"
  | "prescriptionResponsePayload"
  | "reportCount"
  | "latestReportAt"
  | "latestDecisionReportCount"
  | "latestDecisionReportAt"
> & {
  officialResultReady: boolean;
  officialResultReason: string | null;
};

export type ResultsOverviewReport = {
  id: string;
  revision: number;
  publishedAt: string;
  sha256: string;
  analysisId: string;
  analysisCode: string;
  clientName: string;
  propertyName: string;
  fieldName: string;
  seasonLabel: string;
  publishedByName: string | null;
};

/**
 * Read model da tela Resultados.
 *
 * Antes a página abria três contextos tenant separados (relatórios, análises e estado de entrega).
 * Agora relatório oficial mais recente por análise + até 200 análises correntes + freshness/entrega
 * saem de uma única query e de um único contexto RLS. Histórico imutável continua preservado no banco.
 */
export async function getResultsOverview(tenantId: string, userId?: string): Promise<{
  published: ResultsOverviewReport[];
  analyses: ResultsOverviewAnalysis[];
  deliveryRows: DecisionDeliveryStatus[];
}> {
  return withTenant({ tenantId, userId }, async (client) => {
    const result = await client.query<{ published: ResultsOverviewReport[]; analyses: ResultsAnalysisRow[] }>(
      `SELECT
         coalesce((
           SELECT json_agg(row_to_json(published_row) ORDER BY published_row."publishedAt" DESC)
           FROM (
             SELECT DISTINCT ON (a.id)
                    r.id::text AS id,
                    r.revision,
                    r.published_at::text AS "publishedAt",
                    r.sha256,
                    a.id::text AS "analysisId",
                    a.code AS "analysisCode",
                    c.name AS "clientName",
                    p.name AS "propertyName",
                    f.name AS "fieldName",
                    cs.season_label AS "seasonLabel",
                    publisher.name AS "publishedByName"
             FROM reports r
             JOIN interpretations i ON i.tenant_id=r.tenant_id AND i.id=r.interpretation_id
             JOIN analyses a ON a.tenant_id=i.tenant_id AND a.id=i.analysis_id
             JOIN crop_seasons cs ON cs.tenant_id=a.tenant_id AND cs.id=a.crop_season_id
             JOIN fields f ON f.tenant_id=cs.tenant_id AND f.id=cs.field_id
             JOIN properties p ON p.tenant_id=f.tenant_id AND p.id=f.property_id
             JOIN clients c ON c.tenant_id=p.tenant_id AND c.id=p.client_id
             LEFT JOIN users publisher ON publisher.id=r.published_by
             WHERE r.tenant_id=$1::uuid
             ORDER BY a.id, r.published_at DESC, r.id DESC
           ) published_row
         ), '[]'::json) AS published,

         coalesce((
           SELECT json_agg(row_to_json(analysis_row) ORDER BY analysis_row."updatedAt" DESC)
           FROM (
             SELECT a.id::text AS id,
                    a.code,
                    a.status::text AS status,
                    a.confidence_score::float8 AS "confidenceScore",
                    a.requested_analysis_depth AS "requestedAnalysisDepth",
                    a.created_at::text AS "createdAt",
                    a.updated_at::text AS "updatedAt",
                    c.name AS "clientName",
                    p.name AS "propertyName",
                    f.name AS "fieldName",
                    f.area_ha::float8 AS "areaHa",
                    cs.season_label AS "seasonLabel",
                    cs.current_crop AS "currentCrop",
                    cs.next_crop AS "nextCrop",
                    li.status AS "latestInterpretationStatus",
                    li.not_interpretable_reason AS "notInterpretableReason",
                    cs.updated_at::text AS "cropSeasonUpdatedAt",
                    li.id::text AS "latestInterpretationId",
                    li.created_at::text AS "latestInterpretationCreatedAt",
                    li.crop_profile_id::text AS "latestInterpretationCropProfileId",
                    cs.crop_profile_id::text AS "currentCropProfileId",
                    latest_import.latest_import_at::text AS "latestImportCommittedAt",
                    rule_state.latest_rule_updated_at::text AS "latestRuleUpdatedAt",
                    prescription.id::text AS "prescriptionId",
                    prescription.status::text AS "prescriptionStatus",
                    prescription.created_at::text AS "prescriptionCreatedAt",
                    prescription.interpretation_id::text AS "prescriptionInterpretationId",
                    prescription.response_payload AS "prescriptionResponsePayload",
                    coalesce(report_stats.report_count,0)::int AS "reportCount",
                    report_stats.latest_report_at::text AS "latestReportAt",
                    coalesce(current_report_stats.report_count,0)::int AS "latestDecisionReportCount",
                    current_report_stats.latest_report_at::text AS "latestDecisionReportAt"
             FROM analyses a
             JOIN crop_seasons cs ON cs.tenant_id=a.tenant_id AND cs.id=a.crop_season_id
             JOIN fields f ON f.tenant_id=cs.tenant_id AND f.id=cs.field_id
             JOIN properties p ON p.tenant_id=f.tenant_id AND p.id=f.property_id
             JOIN clients c ON c.tenant_id=p.tenant_id AND c.id=p.client_id
             LEFT JOIN crop_profiles cp ON cp.id=cs.crop_profile_id
             LEFT JOIN LATERAL (
               SELECT i.id, i.status, i.not_interpretable_reason, i.created_at, i.crop_profile_id
               FROM interpretations i
               WHERE i.tenant_id=a.tenant_id AND i.analysis_id=a.id
               ORDER BY i.revision DESC
               LIMIT 1
             ) li ON true
             LEFT JOIN LATERAL (
               SELECT max(coalesce(ai.committed_at, ai.created_at)) AS latest_import_at
               FROM analysis_imports ai
               WHERE ai.tenant_id=a.tenant_id AND ai.analysis_id=a.id
             ) latest_import ON true
             LEFT JOIN LATERAL (
               SELECT greatest(cp.updated_at, coalesce(max(cpp.updated_at), cp.updated_at)) AS latest_rule_updated_at
               FROM crop_profile_parameters cpp
               WHERE cpp.crop_profile_id=cp.id
             ) rule_state ON cp.id IS NOT NULL
             LEFT JOIN LATERAL (
               SELECT ag.id, ag.status, ag.created_at, ag.interpretation_id, ag.response_payload
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
               WHERE r.tenant_id=a.tenant_id
                 AND r.interpretation_id=li.id
                 AND r.prescription_generation_id=prescription.id
             ) current_report_stats ON true
             WHERE a.tenant_id=$1::uuid
             ORDER BY a.updated_at DESC
             LIMIT 200
           ) analysis_row
         ), '[]'::json) AS analyses`,
      [tenantId],
    );

    const row = result.rows[0] ?? { published: [], analyses: [] };
    const sourceAnalyses = row.analyses ?? [];
    const deliveryRows: DecisionDeliveryStatus[] = sourceAnalyses.map((analysis) => {
      const interpretationFreshness = analysis.latestInterpretationId
        ? evaluateAnalysisEvidenceFreshness({
            interpretationCreatedAt: analysis.latestInterpretationCreatedAt,
            latestImportCommittedAt: analysis.latestImportCommittedAt,
            interpretationCropProfileId: analysis.latestInterpretationCropProfileId,
            currentCropProfileId: analysis.currentCropProfileId,
            latestRuleUpdatedAt: analysis.latestRuleUpdatedAt,
          })
        : { current: false, reason: null };

      const prescriptionCurrent = Boolean(
        interpretationFreshness.current
        && analysis.prescriptionId
        && analysis.prescriptionInterpretationId
        && analysis.prescriptionInterpretationId === analysis.latestInterpretationId
        && analysis.prescriptionCreatedAt
        && new Date(analysis.prescriptionCreatedAt).getTime() >= new Date(analysis.cropSeasonUpdatedAt).getTime(),
      );
      const currentReportCount = interpretationFreshness.current && prescriptionCurrent
        ? analysis.latestDecisionReportCount
        : 0;

      return {
        analysisId: analysis.id,
        prescriptionStatus: analysis.prescriptionStatus,
        prescriptionCreatedAt: analysis.prescriptionCreatedAt,
        interpretationCurrent: interpretationFreshness.current,
        interpretationStaleReason: interpretationFreshness.current ? null : interpretationFreshness.reason,
        prescriptionCurrent,
        reportCount: analysis.reportCount,
        latestReportAt: analysis.latestReportAt,
        currentReportCount,
        latestCurrentReportAt: currentReportCount > 0 ? analysis.latestDecisionReportAt : null,
      };
    });

    const analyses: ResultsOverviewAnalysis[] = sourceAnalyses.map((analysis) => {
      const completeness = evaluateOfficialResultCompleteness(analysis.prescriptionResponsePayload);
      return {
      id: analysis.id,
      code: analysis.code,
      status: analysis.status,
      confidenceScore: analysis.confidenceScore,
      requestedAnalysisDepth: analysis.requestedAnalysisDepth,
      createdAt: analysis.createdAt,
      updatedAt: analysis.updatedAt,
      clientName: analysis.clientName,
      propertyName: analysis.propertyName,
      fieldName: analysis.fieldName,
      areaHa: analysis.areaHa,
      seasonLabel: analysis.seasonLabel,
      currentCrop: analysis.currentCrop,
      nextCrop: analysis.nextCrop,
      latestInterpretationStatus: analysis.latestInterpretationStatus,
      notInterpretableReason: analysis.notInterpretableReason,
      officialResultReady: completeness.ready,
      officialResultReason: officialResultCompletenessReason(completeness),
      };
    });

    return {
      published: row.published ?? [],
      analyses,
      deliveryRows,
    };
  });
}
