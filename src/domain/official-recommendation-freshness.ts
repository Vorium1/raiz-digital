import { evaluatePrescriptionContextFreshness } from "./prescription-context-freshness.ts";

export type OfficialRecommendationSourceKind = "AI" | "UNRESOLVED_AI" | "NON_AI";

export type OfficialRecommendationFreshness = {
  current: boolean;
  code: "CURRENT" | "SOURCE_UNRESOLVED" | "GENERATION_NOT_APPROVED" | "CONTEXT_CHANGED" | "INTERPRETATION_SUPERSEDED";
  reason: string | null;
};

/**
 * `input_recommendations` é histórico imutável. Esta função decide apenas se uma linha promovida ainda
 * pode ser tratada como a recomendação CORRENTE para comparação/aplicação.
 *
 * Recomendações não-IA continuam fora deste lifecycle específico. Já qualquer linha que declara origem
 * em `ai_generations:*` falha fechada se o vínculo estrutural com a geração não puder ser comprovado.
 */
export function evaluateOfficialRecommendationFreshness(input: {
  sourceKind: OfficialRecommendationSourceKind;
  generationStatus?: string | null;
  generationCreatedAt?: string | null;
  cropSeasonUpdatedAt?: string | null;
  generationInterpretationId?: string | null;
  latestInterpretationId?: string | null;
  latestInterpretationStatus?: string | null;
}): OfficialRecommendationFreshness {
  if (input.sourceKind === "NON_AI") return { current: true, code: "CURRENT", reason: null };

  if (input.sourceKind === "UNRESOLVED_AI") {
    return {
      current: false,
      code: "SOURCE_UNRESOLVED",
      reason: "A origem de IA desta recomendação histórica não pôde ser vinculada com segurança à geração que a produziu.",
    };
  }

  if (input.generationStatus !== "APPROVED") {
    return {
      current: false,
      code: "GENERATION_NOT_APPROVED",
      reason: "A geração de IA que originou esta recomendação não está em estado APPROVED.",
    };
  }

  const context = evaluatePrescriptionContextFreshness({
    generationCreatedAt: input.generationCreatedAt,
    cropSeasonUpdatedAt: input.cropSeasonUpdatedAt,
  });
  if (!context.current) {
    return {
      current: false,
      code: "CONTEXT_CHANGED",
      reason: context.reason ?? "O contexto agronômico mudou depois da geração desta recomendação.",
    };
  }

  if (
    !input.generationInterpretationId
    || input.generationInterpretationId !== input.latestInterpretationId
    || input.latestInterpretationStatus !== "APPROVED"
  ) {
    return {
      current: false,
      code: "INTERPRETATION_SUPERSEDED",
      reason: "A interpretação determinística usada por esta recomendação foi superada ou deixou de ser a revisão APPROVED atual.",
    };
  }

  return { current: true, code: "CURRENT", reason: null };
}
