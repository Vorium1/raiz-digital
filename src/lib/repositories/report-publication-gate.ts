import { withTenant } from "@/lib/db";

export type ReportPublicationReadiness = {
  allowed: boolean;
  reason: string | null;
  interpretationStatus: string | null;
  prescriptionStatus: string | null;
  prescriptionId: string | null;
};

export class ReportPublicationGateError extends Error {
  constructor(message: string, public status = 409) {
    super(message);
    this.name = "ReportPublicationGateError";
  }
}

/**
 * Gate da entrega oficial. O relatório publicado representa a decisão técnica final da RAIZ, então não
 * pode pular a sequência interpretação aprovada -> recomendação aprovada -> publicação.
 *
 * A recomendação precisa pertencer À MESMA interpretação que será publicada. Isso impede que uma
 * prescrição aprovada de uma revisão antiga autorize silenciosamente um relatório novo recalculado.
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
              prescription.status::text AS "prescriptionStatus"
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
    if (!row) return { allowed: false, reason: "Interpretação não encontrada.", interpretationStatus: null, prescriptionStatus: null, prescriptionId: null };
    if (row.interpretationStatus !== "APPROVED") {
      return {
        allowed: false,
        reason: "A interpretação precisa estar aprovada pelo responsável técnico antes da entrega oficial.",
        interpretationStatus: row.interpretationStatus,
        prescriptionStatus: row.prescriptionStatus ?? null,
        prescriptionId: row.prescriptionId ?? null,
      };
    }
    if (!row.prescriptionId) {
      return {
        allowed: false,
        reason: "Gere e aprove a Recomendação Assistida RAIZ antes de publicar o relatório oficial.",
        interpretationStatus: row.interpretationStatus,
        prescriptionStatus: null,
        prescriptionId: null,
      };
    }
    if (row.prescriptionStatus !== "APPROVED") {
      return {
        allowed: false,
        reason: row.prescriptionStatus === "PENDING_REVIEW"
          ? "A recomendação está pronta, mas ainda precisa de revisão profissional antes da publicação."
          : row.prescriptionStatus === "CHANGES_REQUESTED"
            ? "A recomendação recebeu solicitação de ajuste e precisa de uma nova versão aprovada antes da publicação."
            : "A recomendação atual não está aprovada; a entrega oficial permanece bloqueada.",
        interpretationStatus: row.interpretationStatus,
        prescriptionStatus: row.prescriptionStatus,
        prescriptionId: row.prescriptionId,
      };
    }
    return {
      allowed: true,
      reason: null,
      interpretationStatus: row.interpretationStatus,
      prescriptionStatus: row.prescriptionStatus,
      prescriptionId: row.prescriptionId,
    };
  });
}

export async function assertReportPublicationReady(tenantId: string, interpretationId: string, userId?: string) {
  const readiness = await getReportPublicationReadiness(tenantId, interpretationId, userId);
  if (!readiness.allowed) throw new ReportPublicationGateError(readiness.reason ?? "Relatório ainda não está pronto para publicação.");
  return readiness;
}
