export type PrescriptionSnapshotConsistency = {
  current: boolean;
  reason: string | null;
};

type PrescriptionSnapshotConsistencyInput = {
  snapshotSeasonUpdatedAt: string | null | undefined;
  currentSeasonUpdatedAt: string | null | undefined;
  snapshotInterpretationId: string | null | undefined;
  currentInterpretationId: string | null | undefined;
  currentInterpretationStatus: string | null | undefined;
};

function evaluatePrescriptionSnapshotConsistencyForStatuses(
  input: PrescriptionSnapshotConsistencyInput,
  allowedInterpretationStatuses: readonly string[],
  invalidStatusReason: string,
): PrescriptionSnapshotConsistency {
  if (!input.snapshotSeasonUpdatedAt || !input.currentSeasonUpdatedAt) {
    return { current: false, reason: "Não foi possível comprovar a versão atual do contexto da safra." };
  }
  if (input.snapshotSeasonUpdatedAt !== input.currentSeasonUpdatedAt) {
    return { current: false, reason: "O contexto agronômico da safra mudou durante a geração." };
  }
  if (!input.snapshotInterpretationId || !input.currentInterpretationId) {
    return { current: false, reason: "Não foi possível comprovar a revisão determinística vinculada à prescrição." };
  }
  if (input.snapshotInterpretationId !== input.currentInterpretationId) {
    return { current: false, reason: "A interpretação determinística mudou durante a geração." };
  }
  if (!input.currentInterpretationStatus || !allowedInterpretationStatuses.includes(input.currentInterpretationStatus)) {
    return { current: false, reason: invalidStatusReason };
  }
  return { current: true, reason: null };
}

/**
 * Política estrita para qualquer fluxo oficial/pós-revisão. A interpretação precisa continuar sendo
 * exatamente a mesma revisão e permanecer APPROVED.
 */
export function evaluatePrescriptionSnapshotConsistency(
  input: PrescriptionSnapshotConsistencyInput,
): PrescriptionSnapshotConsistency {
  return evaluatePrescriptionSnapshotConsistencyForStatuses(
    input,
    ["APPROVED"],
    "A interpretação determinística deixou de ser a revisão APPROVED atual.",
  );
}

/**
 * Política exclusiva de preparação de rascunho UX 2.0. A mesma interpretação pode permanecer IN_REVIEW
 * ou APPROVED durante a geração, mas qualquer troca de revisão, contexto ou status inesperado falha fechado.
 */
export function evaluatePrescriptionDraftSnapshotConsistency(
  input: PrescriptionSnapshotConsistencyInput,
): PrescriptionSnapshotConsistency {
  return evaluatePrescriptionSnapshotConsistencyForStatuses(
    input,
    ["IN_REVIEW", "APPROVED"],
    "A interpretação determinística deixou de estar em IN_REVIEW/APPROVED durante a preparação do rascunho.",
  );
}
