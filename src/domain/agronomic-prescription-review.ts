export type PrescriptionReviewStatus = "PENDING_REVIEW" | "APPROVED" | "CHANGES_REQUESTED" | "REJECTED";
export type PrescriptionReviewDecision = "APPROVED" | "CHANGES_REQUESTED" | "REJECTED";

export type PrescriptionReviewTransition = {
  allowed: boolean;
  noOp: boolean;
  shouldPromoteRecommendations: boolean;
  reason: string | null;
};

/**
 * Política pura de transição da revisão profissional da prescrição.
 *
 * Uma geração de IA é imutável em conteúdo. Por isso:
 * - repetir a MESMA decisão é idempotente e não pode promover doses de novo;
 * - PENDING_REVIEW pode receber a primeira decisão profissional;
 * - depois de decidida, a mesma geração não muda de decisão: um ajuste exige
 *   uma NOVA geração, preservando a trilha e evitando que recomendações já
 *   promovidas fiquem divergentes do status da geração.
 */
export function evaluatePrescriptionReviewTransition(
  currentStatus: PrescriptionReviewStatus,
  requestedDecision: PrescriptionReviewDecision,
): PrescriptionReviewTransition {
  if (currentStatus === requestedDecision) {
    return {
      allowed: true,
      noOp: true,
      shouldPromoteRecommendations: false,
      reason: null,
    };
  }

  if (currentStatus !== "PENDING_REVIEW") {
    return {
      allowed: false,
      noOp: false,
      shouldPromoteRecommendations: false,
      reason: currentStatus === "CHANGES_REQUESTED"
        ? "Esta geração já recebeu solicitação de ajuste. Gere uma nova versão antes de revisar novamente."
        : "Esta geração já possui uma decisão profissional final. Gere uma nova versão para uma nova decisão.",
    };
  }

  return {
    allowed: true,
    noOp: false,
    shouldPromoteRecommendations: requestedDecision === "APPROVED",
    reason: null,
  };
}
