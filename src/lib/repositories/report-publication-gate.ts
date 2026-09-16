import { evaluateAnalysisEvidenceFreshness } from "@/domain/analysis-evidence-freshness";
import { withTenant } from "@/lib/db";
import { evaluateReportPublicationGate, type ReportPublicationReadiness } from "@/domain/report-publication-gate";

export type { ReportPublicationReadiness } from "@/domain/report-publication-gate";

export class ReportPublicationGateError extends Error {
  status: number;

  constructor(message: string, status = 409) {
    super(message);
    this.name = "ReportPublicationGateError";
    this.status = status;
  }
}

/**
 * Gate da entrega oficial. A recomendação precisa pertencer À MESMA interpretação que será publicada,
 * a interpretação precisa ser a revisão mais recente e ainda representar o laudo corrente, a geração
 * deve continuar compatível com o contexto atual da safra e, quando a política do tenant exigir, o
 * arquivo bruto precisa estar confirmado.
 */
export async function getReportPublicationReadiness(
  tenantId: string,
  interpretationId: string,
  userId?: string,
): Promise<ReportPublicationReadiness> {
  return withTenant({ tenantId, userId }, async (client) => {
    const result = await client.query(
      `SELECT i.status::text AS "interpretationStatus",
              i.created_at::text AS "interpretationCreatedAt",
              (latest_interpretation.id = i.id) AS "interpretationIsLatest",
              a.source_human_verified AS "sourceHumanVerified",
              t.require_source_human_verification AS "sourceVerificationRequired",
              latest_import.latest_import_at::text AS "latestImportCommittedAt",
              prescription.id::text AS "prescriptionId",
              prescription.status::text AS "prescriptionStatus",
              CASE
                WHEN prescription.id IS NULL THEN false
                ELSE prescription.created_at >= cs.updated_at
              END AS "prescriptionCurrent"
       FROM interpretations i
       JOIN analyses a ON a.tenant_id = i.tenant_id AND a.id = i.analysis_id
       JOIN crop_seasons cs ON cs.tenant_id = a.tenant_id AND cs.id = a.crop_season_id
       JOIN tenants t ON t.id = i.tenant_id
       LEFT JOIN LATERAL (
         SELECT li.id
         FROM interpretations li
         WHERE li.tenant_id = i.tenant_id AND li.analysis_id = i.analysis_id
         ORDER BY li.revision DESC
         LIMIT 1
       ) latest_interpretation ON true
       LEFT JOIN LATERAL (
         SELECT max(coalesce(ai.committed_at, ai.created_at)) AS latest_import_at
         FROM analysis_imports ai
         WHERE ai.tenant_id = i.tenant_id AND ai.analysis_id = i.analysis_id
       ) latest_import ON true
       LEFT JOIN LATERAL (
         SELECT ag.id, ag.status, ag.created_at
         FROM ai_generations ag
         WHERE ag.tenant_id=i.tenant_id
           AND ag.interpretation_id=i.id
           AND ag.kind='AGRONOMIC_PRESCRIPTION'
         ORDER BY ag.created_at DESC
         LIMIT 1
       ) prescription ON true
       WHERE i.tenant_id=$1::uuid AND i.id=$2::uuid
       LIMIT 1`,
      [tenantId, interpretationId],
    );
    const row = result.rows[0];
    const evidenceFreshness = row
      ? evaluateAnalysisEvidenceFreshness({
          interpretationCreatedAt: row.interpretationCreatedAt,
          latestImportCommittedAt: row.latestImportCommittedAt,
        })
      : { current: false };
    return evaluateReportPublicationGate({
      interpretationExists: Boolean(row),
      interpretationStatus: row?.interpretationStatus ?? null,
      prescriptionId: row?.prescriptionId ?? null,
      prescriptionStatus: row?.prescriptionStatus ?? null,
      interpretationIsLatest: row?.interpretationIsLatest ?? false,
      interpretationEvidenceCurrent: evidenceFreshness.current,
      prescriptionCurrent: row?.prescriptionCurrent ?? false,
      sourceVerificationRequired: row?.sourceVerificationRequired ?? false,
      sourceHumanVerified: row?.sourceHumanVerified ?? false,
    });
  });
}

export async function assertReportPublicationReady(tenantId: string, interpretationId: string, userId?: string) {
  const readiness = await getReportPublicationReadiness(tenantId, interpretationId, userId);
  if (!readiness.allowed) throw new ReportPublicationGateError(readiness.reason ?? "Relatório ainda não está pronto para publicação.");
  return readiness;
}
