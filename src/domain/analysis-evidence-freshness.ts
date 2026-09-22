export type AnalysisEvidenceFreshnessCode =
  | "CURRENT"
  | "INTERPRETATION_TIMESTAMP_MISSING"
  | "INVALID_TRACE_TIMESTAMPS"
  | "LAB_EVIDENCE_CHANGED"
  | "CROP_PROFILE_CHANGED"
  | "AGRONOMIC_RULES_CHANGED";

export type AnalysisEvidenceFreshness = {
  current: boolean;
  code: AnalysisEvidenceFreshnessCode;
  reason: string | null;
};

/**
 * Decide se uma interpretação determinística ainda representa tanto a evidência laboratorial corrente
 * quanto o catálogo agronômico corrente.
 *
 * `latestImportCommittedAt` deve ser a última efetivação de uma importação vinculada à análise
 * (`committed_at`, com fallback legado para `created_at`). Quando não existe importação gerenciada
 * pela RAIZ, este gate não invalida fontes INTEGRATION/MANUAL só pela ausência desse timestamp.
 *
 * `interpretationCropProfileId/currentCropProfileId` comprovam identidade do perfil usado no cálculo.
 * Trocar o perfil da safra invalida a revisão mesmo que o novo registro tenha `updated_at` antigo.
 *
 * `latestRuleUpdatedAt` é a atualização mais recente do perfil da cultura ou de qualquer regra
 * `crop_profile_parameters` vinculada a ele. Se a regra mudou depois da interpretação, a revisão antiga
 * é histórica e precisa ser recalculada antes de prescrição, aprovação ou publicação.
 */
export function evaluateAnalysisEvidenceFreshness(input: {
  interpretationCreatedAt: string | null | undefined;
  latestImportCommittedAt: string | null | undefined;
  interpretationCropProfileId?: string | null | undefined;
  currentCropProfileId?: string | null | undefined;
  latestRuleUpdatedAt?: string | null | undefined;
}): AnalysisEvidenceFreshness {
  const profileIdentityProvided = input.interpretationCropProfileId !== undefined || input.currentCropProfileId !== undefined;
  if (profileIdentityProvided && input.interpretationCropProfileId !== input.currentCropProfileId) {
    return {
      current: false,
      code: "CROP_PROFILE_CHANGED",
      reason: "O perfil agronômico da safra mudou depois desta análise. Atualize a análise para usar o perfil atual.",
    };
  }

  if (!input.latestImportCommittedAt && !input.latestRuleUpdatedAt) {
    return { current: true, code: "CURRENT", reason: null };
  }

  if (!input.interpretationCreatedAt) {
    return {
      current: false,
      code: "INTERPRETATION_TIMESTAMP_MISSING",
      reason: "Não foi possível comprovar quando a análise foi calculada em relação às evidências atuais.",
    };
  }

  const interpretationAt = new Date(input.interpretationCreatedAt).getTime();
  const importAt = input.latestImportCommittedAt ? new Date(input.latestImportCommittedAt).getTime() : null;
  const ruleAt = input.latestRuleUpdatedAt ? new Date(input.latestRuleUpdatedAt).getTime() : null;

  if (
    !Number.isFinite(interpretationAt)
    || (importAt != null && !Number.isFinite(importAt))
    || (ruleAt != null && !Number.isFinite(ruleAt))
  ) {
    return {
      current: false,
      code: "INVALID_TRACE_TIMESTAMPS",
      reason: "As datas de rastreabilidade entre os dados, as regras e a análise são inválidas.",
    };
  }

  if (importAt != null && interpretationAt < importAt) {
    return {
      current: false,
      code: "LAB_EVIDENCE_CHANGED",
      reason: "O laudo laboratorial foi alterado depois desta análise. Atualize a análise antes de continuar.",
    };
  }

  if (ruleAt != null && interpretationAt < ruleAt) {
    return {
      current: false,
      code: "AGRONOMIC_RULES_CHANGED",
      reason: "As regras agronômicas desta cultura foram atualizadas depois desta análise. Atualize a análise para usar as regras atuais.",
    };
  }

  return { current: true, code: "CURRENT", reason: null };
}
