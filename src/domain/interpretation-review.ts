export type InterpretationReviewStatus = "CALCULATED" | "AI_GENERATED" | "IN_REVIEW" | "APPROVED" | "PUBLISHED" | "SUPERSEDED";

export type InterpretationReviewTransition = {
  allowed: boolean;
  noOp: boolean;
  nextStatus: InterpretationReviewStatus | null;
  reason: string | null;
};

/**
 * Política de estado para a revisão da interpretação determinística.
 *
 * A revisão é imutável depois de aprovada/publicada e somente a revisão mais
 * recente de uma análise pode receber decisão. Uma revisão CALCULATED existe
 * quando o motor não conseguiu fechar a interpretação; o endpoint de revisão
 * não pode transformá-la artificialmente em IN_REVIEW/APPROVED.
 */
export function evaluateInterpretationReviewTransition(input: {
  currentStatus: InterpretationReviewStatus;
  approve: boolean;
  isLatestRevision: boolean;
}): InterpretationReviewTransition {
  if (!input.isLatestRevision) {
    return {
      allowed: false,
      noOp: false,
      nextStatus: null,
      reason: "Somente a revisão mais recente da análise pode receber uma decisão profissional.",
    };
  }

  if (input.currentStatus === "PUBLISHED" || input.currentStatus === "SUPERSEDED") {
    return {
      allowed: false,
      noOp: false,
      nextStatus: null,
      reason: "Esta revisão é imutável neste estado. Gere uma nova revisão para qualquer alteração.",
    };
  }

  if (input.currentStatus === "APPROVED") {
    if (input.approve) {
      return { allowed: true, noOp: true, nextStatus: "APPROVED", reason: null };
    }
    return {
      allowed: false,
      noOp: false,
      nextStatus: null,
      reason: "Uma interpretação já aprovada não pode voltar para revisão. Recalcule para criar uma nova revisão.",
    };
  }

  if (input.currentStatus === "CALCULATED") {
    return {
      allowed: false,
      noOp: false,
      nextStatus: null,
      reason: "A interpretação ainda possui pendências técnicas e não está apta à revisão profissional.",
    };
  }

  if (input.currentStatus === "AI_GENERATED") {
    if (input.approve) {
      return {
        allowed: false,
        noOp: false,
        nextStatus: null,
        reason: "A revisão precisa entrar em revisão profissional antes de ser aprovada.",
      };
    }
    return { allowed: true, noOp: false, nextStatus: "IN_REVIEW", reason: null };
  }

  // IN_REVIEW
  if (!input.approve) {
    return { allowed: true, noOp: true, nextStatus: "IN_REVIEW", reason: null };
  }
  return { allowed: true, noOp: false, nextStatus: "APPROVED", reason: null };
}
