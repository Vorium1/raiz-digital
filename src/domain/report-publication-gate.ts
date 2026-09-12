export type ReportPublicationReadiness = {
  allowed: boolean;
  reason: string | null;
  interpretationStatus: string | null;
  prescriptionStatus: string | null;
  prescriptionId: string | null;
  alreadyPublished: boolean;
};

export type ReportPublicationGateInput = {
  interpretationExists: boolean;
  interpretationStatus: string | null;
  prescriptionId: string | null;
  prescriptionStatus: string | null;
  reportExists: boolean;
};

/** Regra pura da entrega oficial, sem banco e sem dependências de runtime. */
export function evaluateReportPublicationGate(input: ReportPublicationGateInput): ReportPublicationReadiness {
  if (!input.interpretationExists) {
    return { allowed: false, reason: "Interpretação não encontrada.", interpretationStatus: null, prescriptionStatus: null, prescriptionId: null, alreadyPublished: false };
  }
  if (input.reportExists) {
    return {
      allowed: false,
      reason: "Esta revisão já possui uma decisão oficial publicada. A versão imutável existente deve ser preservada; uma nova entrega exige uma nova revisão técnica.",
      interpretationStatus: input.interpretationStatus,
      prescriptionStatus: input.prescriptionStatus,
      prescriptionId: input.prescriptionId,
      alreadyPublished: true,
    };
  }
  if (input.interpretationStatus !== "APPROVED") {
    return {
      allowed: false,
      reason: "A interpretação precisa estar aprovada pelo responsável técnico antes da entrega oficial.",
      interpretationStatus: input.interpretationStatus,
      prescriptionStatus: input.prescriptionStatus,
      prescriptionId: input.prescriptionId,
      alreadyPublished: false,
    };
  }
  if (!input.prescriptionId) {
    return {
      allowed: false,
      reason: "Gere e aprove a Recomendação Assistida RAIZ antes de publicar o relatório oficial.",
      interpretationStatus: input.interpretationStatus,
      prescriptionStatus: null,
      prescriptionId: null,
      alreadyPublished: false,
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
      alreadyPublished: false,
    };
  }
  return {
    allowed: true,
    reason: null,
    interpretationStatus: input.interpretationStatus,
    prescriptionStatus: input.prescriptionStatus,
    prescriptionId: input.prescriptionId,
    alreadyPublished: false,
  };
}
