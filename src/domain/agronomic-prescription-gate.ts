/**
 * Governança da recomendação assistida RAIZ.
 *
 * UX 2.0 separa duas permissões que antes estavam misturadas:
 *
 * 1. PREPARAR RASCUNHO: a recomendação pode ser gerada enquanto a interpretação atual está
 *    `IN_REVIEW`. Ela nasce `PENDING_REVIEW`, não alimenta `input_recommendations`, não pode ser
 *    publicada e continua sujeita aos validadores determinísticos do servidor.
 *
 * 2. PROMOVER/ENTREGAR: só uma interpretação `APPROVED` pode autorizar aprovação da prescrição,
 *    promoção de doses oficiais e publicação. Essa barreira permanece em `prescription-review.ts`
 *    e `report-publication-gate.ts`.
 *
 * Isso permite o fluxo aprovado de experiência — dados -> análise -> recomendação pronta -> revisão
 * final — sem voltar ao bug antigo em que conteúdo não revisado podia virar recomendação oficial.
 */
export type PrescriptionGateResult = { allowed: true } | { allowed: false; reason: string };

export const PRESCRIPTION_DRAFT_STATUS = "PENDING_REVIEW" as const;

export const PRESCRIPTION_GATE_BLOCKED_REASON =
  "É necessário ter uma interpretação técnica aprovada por um profissional antes de promover ou entregar uma recomendação oficial.";

export const PRESCRIPTION_DRAFT_GATE_BLOCKED_REASON =
  "A RAIZ precisa de uma interpretação determinística corrente e interpretável antes de preparar o rascunho da recomendação.";

/** Gate estrito para qualquer ação que possa transformar a recomendação em decisão oficial. */
export function checkPrescriptionGate(interpretationStatus: string | null): PrescriptionGateResult {
  if (interpretationStatus !== "APPROVED") {
    return { allowed: false, reason: PRESCRIPTION_GATE_BLOCKED_REASON };
  }
  return { allowed: true };
}

/**
 * Gate de preparação: `IN_REVIEW` é suficiente apenas para GERAR um rascunho a ser mostrado na mesma
 * revisão profissional. `CALCULATED`, ausência de interpretação ou status inesperado continuam fechados.
 */
export function checkPrescriptionDraftGate(interpretationStatus: string | null): PrescriptionGateResult {
  if (interpretationStatus !== "IN_REVIEW" && interpretationStatus !== "APPROVED") {
    return { allowed: false, reason: PRESCRIPTION_DRAFT_GATE_BLOCKED_REASON };
  }
  return { allowed: true };
}
