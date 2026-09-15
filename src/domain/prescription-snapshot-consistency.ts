export type PrescriptionSnapshotConsistency = {
  current: boolean;
  reason: string | null;
};

/**
 * Confirma que o snapshot de evidências usado por uma geração ainda é exatamente o snapshot corrente.
 *
 * `seasonUpdatedAt` é tratado como token de versão, não como aproximação temporal: qualquer diferença
 * significa que algum dado da safra mudou. A interpretação também precisa ser a MESMA revisão e continuar
 * APPROVED. Isso fecha a janela em que o provedor de IA responde enquanto outro usuário altera o contexto
 * ou cria/revisa uma nova interpretação.
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
    return { current: false, reason: "Não foi possível comprovar a revisão determinística vinculada à prescrição." };
  }
  if (input.snapshotInterpretationId !== input.currentInterpretationId || input.currentInterpretationStatus !== "APPROVED") {
    return { current: false, reason: "A interpretação determinística mudou ou deixou de ser a revisão APPROVED atual." };
  }
  return { current: true, reason: null };
}
