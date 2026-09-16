export type AnalysisEvidenceFreshnessCode =
  | "CURRENT"
  | "INTERPRETATION_TIMESTAMP_MISSING"
  | "INVALID_TRACE_TIMESTAMPS"
  | "LAB_EVIDENCE_CHANGED";

export type AnalysisEvidenceFreshness = {
  current: boolean;
  code: AnalysisEvidenceFreshnessCode;
  reason: string | null;
};

/**
 * Decide se uma interpretação determinística ainda representa a evidência laboratorial corrente.
 *
 * `latestImportCommittedAt` deve ser a última efetivação de uma importação vinculada à análise
 * (`committed_at`, com fallback legado para `created_at`). Quando não existe importação gerenciada
 * pela RAIZ, este gate não invalida fontes INTEGRATION/MANUAL por ausência de um timestamp que elas
 * não possuem.
 *
 * Quando existe importação, falha fechada para timestamp ausente/inválido. Uma interpretação criada
 * antes da última efetivação do laudo é histórica: precisa ser recalculada antes de aprovação,
 * prescrição, promoção de doses ou publicação.
 */
export function evaluateAnalysisEvidenceFreshness(input: {
  interpretationCreatedAt: string | null | undefined;
  latestImportCommittedAt: string | null | undefined;
}): AnalysisEvidenceFreshness {
  if (!input.latestImportCommittedAt) {
    return { current: true, code: "CURRENT", reason: null };
  }

  if (!input.interpretationCreatedAt) {
    return {
      current: false,
      code: "INTERPRETATION_TIMESTAMP_MISSING",
      reason: "Não foi possível comprovar quando a interpretação foi calculada em relação ao laudo atual.",
    };
  }

  const interpretationAt = new Date(input.interpretationCreatedAt).getTime();
  const importAt = new Date(input.latestImportCommittedAt).getTime();
  if (!Number.isFinite(interpretationAt) || !Number.isFinite(importAt)) {
    return {
      current: false,
      code: "INVALID_TRACE_TIMESTAMPS",
      reason: "As datas de rastreabilidade entre o laudo e a interpretação são inválidas.",
    };
  }

  if (interpretationAt < importAt) {
    return {
      current: false,
      code: "LAB_EVIDENCE_CHANGED",
      reason: "O laudo laboratorial foi alterado depois desta interpretação. Recalcule e aprove uma nova interpretação antes de continuar.",
    };
  }

  return { current: true, code: "CURRENT", reason: null };
}
