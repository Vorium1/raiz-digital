export type ReportPublicationReadiness = {
  allowed: boolean;
  reason: string | null;
  interpretationStatus: string | null;
  prescriptionStatus: string | null;
  prescriptionId: string | null;
};

export type ReportPublicationGateInput = {
  interpretationExists: boolean;
  interpretationStatus: string | null;
  prescriptionId: string | null;
  prescriptionStatus: string | null;
};

/** Regra pura da entrega oficial, sem banco e sem dependências de runtime. */
export function evaluateReportPublicationGate(input: ReportPublicationGateInput): ReportPublicationReadiness {
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
