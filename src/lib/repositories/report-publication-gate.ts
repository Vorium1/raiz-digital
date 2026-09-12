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
 * impedindo que uma prescrição aprovada de uma revisão antiga autorize silenciosamente uma revisão nova.
 * A mesma revisão também só pode ser publicada uma vez: o snapshot oficial é imutável.
 */
export async function getReportPublicationReadiness(
  tenantId: string,
  interpretationId: string,
  userId?: string,
): Promise<ReportPublicationReadiness> {
  return withTenant({ tenantId, userId }, async (client) => {
    const result = await client.query(
      `SELECT i.status::text AS "interpretationStatus",
              prescription.id::text AS "prescriptionId",
              prescription.status::text AS "prescriptionStatus",
              EXISTS (
                SELECT 1 FROM reports r
                WHERE r.tenant_id=i.tenant_id
                  AND r.interpretation_id=i.id
                  AND r.revision=i.revision
              ) AS "reportExists"
       FROM interpretations i
       LEFT JOIN LATERAL (
         SELECT ag.id, ag.status
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
    return evaluateReportPublicationGate({
      interpretationExists: Boolean(row),
      interpretationStatus: row?.interpretationStatus ?? null,
      prescriptionId: row?.prescriptionId ?? null,
      prescriptionStatus: row?.prescriptionStatus ?? null,
      reportExists: Boolean(row?.reportExists),
    });
  });
}

export async function assertReportPublicationReady(tenantId: string, interpretationId: string, userId?: string) {
  const readiness = await getReportPublicationReadiness(tenantId, interpretationId, userId);
  if (!readiness.allowed) throw new ReportPublicationGateError(readiness.reason ?? "Relatório ainda não está pronto para publicação.");
  return readiness;
}
