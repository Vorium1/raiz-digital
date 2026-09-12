import { withTenant } from "@/lib/db";

export type ReportPublicationReadiness = {
  allowed: boolean;
  reason: string | null;
  interpretationStatus: string | null;
  prescriptionStatus: string | null;
  prescriptionId: string | null;
};

type GateInput = {
  interpretationExists: boolean;
  interpretationStatus: string | null;
  prescriptionId: string | null;
  prescriptionStatus: string | null;
};

export class ReportPublicationGateError extends Error {
  status: number;

  constructor(message: string, status = 409) {
    super(message);
    this.name = "ReportPublicationGateError";
    this.status = status;
  }
}

/** Regra pura do gate, mantida separada da consulta para poder ser testada sem banco. */
export function evaluateReportPublicationGate(input: GateInput): ReportPublicationReadiness {
  if (!input.interpretationExists) {
    return { allowed: false, reason: "Interpretação não encontrada.", interpretationStatus: null, prescriptionStatus: null, prescriptionId: null };
  }
  if (input.interpretationStatus !== "APPROVED") {
    return {
      allowed: false,
      reason: "A interpretação precisa estar aprovada pelo responsável técnico antes da entrega oficial.",
      interpretationStatus: input.interpretationStatus,
      prescriptionStatus: input.prescriptionStatus,
      prescriptionId: input.prescriptionId,
    };
  }
  if (!input.prescriptionId) {
    return {
      allowed: false,
      reason: "Gere e aprove a Recomendação Assistida RAIZ antes de publicar o relatório oficial.",
      interpretationStatus: input.interpretationStatus,
      prescriptionStatus: null,
      prescriptionId: null,
    };
  }
  if (input.prescriptionStatus !== "APPROVED") {
    return {
      allowed: false,
      reason: input.prescriptionStatus === "PENDING_REVIEW"
        ? "A recomendação está pronta, mas ainda precisa de revisão profissional antes da publicação."
        : input.prescriptionStatus === "CHANGES_REQUESTED"
          ? "A recomendação recebeu solicitação de ajuste e precisa de uma nova versão aprovada antes da publicação."
          : "A recomendação atual não está aprovada; a entrega oficial permanece bloqueada.",
      interpretationStatus: input.interpretationStatus,
      prescriptionStatus: input.prescriptionStatus,
      prescriptionId: input.prescriptionId,
    };
  }
  return {
    allowed: true,
    reason: null,
    interpretationStatus: input.interpretationStatus,
    prescriptionStatus: input.prescriptionStatus,
    prescriptionId: input.prescriptionId,
  };
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
    return evaluateReportPublicationGate({
      interpretationExists: Boolean(row),
      interpretationStatus: row?.interpretationStatus ?? null,
      prescriptionId: row?.prescriptionId ?? null,
      prescriptionStatus: row?.prescriptionStatus ?? null,
    });
  });
}

export async function assertReportPublicationReady(tenantId: string, interpretationId: string, userId?: string) {
  const readiness = await getReportPublicationReadiness(tenantId, interpretationId, userId);
  if (!readiness.allowed) throw new ReportPublicationGateError(readiness.reason ?? "Relatório ainda não está pronto para publicação.");
  return readiness;
}
