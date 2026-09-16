export type PrescriptionSnapshotConsistency = {
  current: boolean;
  reason: string | null;
};

const REVIEWABLE_INTERPRETATION_STATUSES = new Set(["IN_REVIEW", "APPROVED", "PUBLISHED"]);

/**
 * Confirma que o snapshot usado pela geração ainda é exatamente o snapshot corrente.
 *
 * A recomendação pode ser construída antes da assinatura profissional, portanto a mesma revisão
 * determinística continua válida enquanto estiver IN_REVIEW, APPROVED ou PUBLISHED. O que nunca pode
 * acontecer é gerar em cima de revisão antiga, sem cobertura (CALCULATED) ou superada.
 */
export function evaluatePrescriptionSnapshotConsistency(input: {
  snapshotSeasonUpdatedAt: string | null | undefined;
  currentSeasonUpdatedAt: string | null | undefined;
  snapshotInterpretationId: string | null | undefined;
  currentInterpretationId: string | null | undefined;
  currentInterpretationStatus: string | null | undefined;
}): PrescriptionSnapshotConsistency {
  if (!input.snapshotSeasonUpdatedAt || !input.currentSeasonUpdatedAt) {
    return { current: false, reason: "Não foi possível comprovar a versão atual do contexto da safra." };
  }
  if (input.snapshotSeasonUpdatedAt !== input.currentSeasonUpdatedAt) {
    return { current: false, reason: "O contexto agronômico da safra mudou durante a geração." };
  }
  if (!input.snapshotInterpretationId || !input.currentInterpretationId) {
    return { current: false, reason: "Não foi possível comprovar a revisão determinística vinculada à recomendação." };
  }
  if (input.snapshotInterpretationId !== input.currentInterpretationId) {
    return { current: false, reason: "A interpretação determinística mudou durante a geração." };
  }
  if (!input.currentInterpretationStatus || !REVIEWABLE_INTERPRETATION_STATUSES.has(input.currentInterpretationStatus)) {
    return { current: false, reason: "A interpretação determinística atual não possui cobertura suficiente para sustentar a recomendação." };
  }
  return { current: true, reason: null };
}
