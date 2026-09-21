import { buildAgronomicPrescriptionEvidencePackage } from "@/lib/ai/prescription-evidence-package";
import { resolveAgronomicPrescriptionProvider } from "@/lib/ai/agronomic-prescription-provider";
import { deterministicLimitedPrescriptionProvider } from "@/lib/ai/providers/deterministic-limited-prescription-provider";
import { checkPrescriptionDraftGate } from "@/domain/agronomic-prescription-gate";
import { evaluatePrescriptionDraftSnapshotConsistency } from "@/domain/prescription-snapshot-consistency";
import { evaluateAnalysisContextFingerprintFreshness } from "@/domain/prescription-context-freshness";
import { validatePrescriptionPkRecommendations, type PrescriptionRecommendationCandidate } from "@/domain/prescription-pk-validation";
import { validatePrescriptionSulfurRecommendation } from "@/domain/prescription-sulfur-validation";
import { validatePrescriptionNitrogenRecommendation } from "@/domain/prescription-nitrogen-validation";
import { validatePrescriptionLimingRecommendation } from "@/domain/prescription-liming-validation";
import { getAnalysisEvidenceState } from "@/lib/repositories/analysis-evidence";
import { AiGenerationError, getLatestAgronomicPrescription } from "@/lib/repositories/ai-generations";
import { getLatestInterpretation } from "@/lib/repositories/interpretations";
import { recordAgronomicPrescriptionGenerationSafely } from "@/lib/repositories/prescription-generation";
import { reviewAgronomicPrescriptionSafely } from "@/lib/repositories/prescription-review";
import { getRecommendationContextByAnalysis } from "@/lib/repositories/recommendation-context";
import { getAnalysisPlanningContext } from "@/lib/repositories/analyses";
import { getTenantPrescriptionUsage } from "@/lib/repositories/tenant-plan";
import { calculateNitrogenRecommendation, getNitrogenRecommendationWorkspace, NitrogenRecommendationError } from "@/lib/repositories/nitrogen-recommendation";

function interpretationItems(structuredOutput: unknown) {
  if (!structuredOutput || typeof structuredOutput !== "object" || Array.isArray(structuredOutput)) return [];
  const value = (structuredOutput as { interpretation?: unknown }).interpretation;
  return Array.isArray(value) ? value : [];
}

async function enrichEvidenceWithAutomaticNitrogen(input: {
  tenantId: string;
  userId: string;
  analysisId: string;
}, initialEvidence: NonNullable<Awaited<ReturnType<typeof buildAgronomicPrescriptionEvidencePackage>>>) {
  if (initialEvidence.deterministicNitrogenEvidence.status === "CURRENT") return initialEvidence;

  const workspace = await getNitrogenRecommendationWorkspace(input);

  if (!workspace.readiness.ready || !workspace.recommendationPreview) {
    return initialEvidence;
  }

  try {
    await calculateNitrogenRecommendation(input);
  } catch (error) {
    if (error instanceof NitrogenRecommendationError && error.status === 422) {
      // O contexto pode ter mudado entre a leitura e a execução. Falha fechada
      // somente para N; o restante do parecer continua disponível.
      return initialEvidence;
    }
    throw error;
  }

  const refreshed = await buildAgronomicPrescriptionEvidencePackage(
    input.tenantId,
    input.userId,
    input.analysisId,
  );
  if (!refreshed) throw new AiGenerationError("Análise não encontrada após atualizar o cálculo de N.", 404);
  return refreshed;
}

export async function prepareAgronomicPrescriptionDraft(input: {
  tenantId: string;
  userId: string;
  analysisId: string;
  mode?: "default" | "deterministic";
}) {
  let provider = input.mode === "deterministic"
    ? deterministicLimitedPrescriptionProvider
    : resolveAgronomicPrescriptionProvider();
  if (provider.isRealLanguageModel) {
    const usage = await getTenantPrescriptionUsage(input.tenantId);
    if (usage.usedThisMonth >= usage.monthlyLimit) {
      provider = deterministicLimitedPrescriptionProvider;
    }
  }

  const initialEvidence = await buildAgronomicPrescriptionEvidencePackage(input.tenantId, input.userId, input.analysisId);
  if (!initialEvidence) throw new AiGenerationError("Análise não encontrada.", 404);
  const evidence = await enrichEvidenceWithAutomaticNitrogen(input, initialEvidence);
  if (evidence.results.length === 0) {
    throw new AiGenerationError("Não há resultado de laboratório vinculado a esta análise ainda.", 409);
  }

  const [interpretation, contextBeforeProvider, evidenceBeforeProvider, planningBeforeProvider] = await Promise.all([
    getLatestInterpretation(input.tenantId, input.analysisId, input.userId),
    getRecommendationContextByAnalysis({ tenantId: input.tenantId, userId: input.userId, analysisId: input.analysisId }),
    getAnalysisEvidenceState({ tenantId: input.tenantId, userId: input.userId, analysisId: input.analysisId }),
    getAnalysisPlanningContext({ tenantId: input.tenantId, userId: input.userId, analysisId: input.analysisId }),
  ]);

  const gate = checkPrescriptionDraftGate(interpretation?.status ?? null);
  if (!gate.allowed) throw new AiGenerationError(gate.reason, 409);
  if (
    !interpretation?.id
    || evidenceBeforeProvider.interpretationId !== interpretation.id
    || !evidenceBeforeProvider.freshness.current
  ) {
    throw new AiGenerationError(
      evidenceBeforeProvider.freshness.reason
        ?? "O laudo atual ainda não possui uma interpretação determinística corrente. Recalcule antes de gerar a prescrição.",
      409,
    );
  }

  const beforeProvider = evaluatePrescriptionDraftSnapshotConsistency({
    snapshotSeasonUpdatedAt: evidence.season.updatedAt,
    currentSeasonUpdatedAt: contextBeforeProvider.updatedAt,
    snapshotInterpretationId: evidence.deterministicInterpretation?.id,
    currentInterpretationId: interpretation.id,
    currentInterpretationStatus: interpretation.status,
  });
  if (!beforeProvider.current) {
    throw new AiGenerationError(
      `${beforeProvider.reason ?? "As evidências agronômicas mudaram."} Atualize a análise e gere novamente a partir do contexto atual.`,
      409,
    );
  }
  if (!planningBeforeProvider) throw new AiGenerationError("Análise não encontrada.", 404);
  const planningFreshnessBeforeProvider = evaluateAnalysisContextFingerprintFreshness({
    generationFingerprint: evidence.analysis.contextFingerprint,
    currentFingerprint: planningBeforeProvider.contextFingerprint,
  });
  if (!planningFreshnessBeforeProvider.current) {
    throw new AiGenerationError(
      `${planningFreshnessBeforeProvider.reason} Atualize a análise e gere novamente a partir do contexto atual.`,
      409,
    );
  }

  let result;
  try {
    result = await provider.prescribe({ evidence });
  } catch (error) {
    if (!provider.isRealLanguageModel) {
      throw new AiGenerationError(error instanceof Error ? error.message : "Falha ao preparar a conclusão técnica.", 502);
    }
    provider = deterministicLimitedPrescriptionProvider;
    result = await provider.prescribe({ evidence });
  }

  const [interpretationAfterProvider, contextAfterProvider, evidenceAfterProvider, planningAfterProvider] = await Promise.all([
    getLatestInterpretation(input.tenantId, input.analysisId, input.userId),
    getRecommendationContextByAnalysis({ tenantId: input.tenantId, userId: input.userId, analysisId: input.analysisId }),
    getAnalysisEvidenceState({ tenantId: input.tenantId, userId: input.userId, analysisId: input.analysisId }),
    getAnalysisPlanningContext({ tenantId: input.tenantId, userId: input.userId, analysisId: input.analysisId }),
  ]);

  const afterProvider = evaluatePrescriptionDraftSnapshotConsistency({
    snapshotSeasonUpdatedAt: evidence.season.updatedAt,
    currentSeasonUpdatedAt: contextAfterProvider.updatedAt,
    snapshotInterpretationId: evidence.deterministicInterpretation?.id,
    currentInterpretationId: interpretationAfterProvider?.id,
    currentInterpretationStatus: interpretationAfterProvider?.status,
  });
  if (!afterProvider.current) {
    throw new AiGenerationError(
      `${afterProvider.reason ?? "As evidências agronômicas mudaram."} A resposta antiga foi descartada; gere novamente com as evidências atuais.`,
      409,
    );
  }
  if (!planningAfterProvider) throw new AiGenerationError("Análise não encontrada.", 404);
  const planningFreshnessAfterProvider = evaluateAnalysisContextFingerprintFreshness({
    generationFingerprint: evidence.analysis.contextFingerprint,
    currentFingerprint: planningAfterProvider.contextFingerprint,
  });
  if (!planningFreshnessAfterProvider.current) {
    throw new AiGenerationError(
      `${planningFreshnessAfterProvider.reason} A resposta antiga foi descartada; gere novamente com os refinamentos atuais.`,
      409,
    );
  }
  if (
    !interpretationAfterProvider?.id
    || evidenceAfterProvider.interpretationId !== interpretationAfterProvider.id
    || !evidenceAfterProvider.freshness.current
  ) {
    throw new AiGenerationError(
      `${evidenceAfterProvider.freshness.reason ?? "O laudo laboratorial mudou durante a geração."} A resposta antiga foi descartada; recalcule a interpretação e gere novamente.`,
      409,
    );
  }

  const recommendations = result.prescription.recommendations as PrescriptionRecommendationCandidate[];
  const providerPkValidation = validatePrescriptionPkRecommendations({
    recommendations,
    cropCode: contextAfterProvider.cropProfileCode,
    interpretation: interpretationItems(interpretationAfterProvider.structuredOutput),
    yieldGoal: contextAfterProvider.yieldGoal,
    yieldGoalUnit: contextAfterProvider.yieldGoalUnit,
    cultivationOrderAfterSoilAnalysis: contextAfterProvider.cultivationOrderAfterSoilAnalysis,
  });
  if (!providerPkValidation.allowed) {
    const details = providerPkValidation.failures.map((failure) => ({
      inputType: failure.inputType,
      nutrient: failure.nutrient,
      blockers: failure.blockers,
      expected: failure.validation?.expected ?? null,
    }));
    throw new AiGenerationError(
      `A resposta do provedor tentou propor P/K fora do motor determinístico da RAIZ. A geração foi descartada e nada foi salvo. ${JSON.stringify(details)}`,
      502,
    );
  }


  const providerSulfurValidation = validatePrescriptionSulfurRecommendation({
    recommendations,
    deterministicDecision: evidence.deterministicSulfurDose,
  });
  if (!providerSulfurValidation.allowed) {
    throw new AiGenerationError(
      `A resposta do provedor divergiu da regra determinística de enxofre da RAIZ. A geração foi descartada e nada foi salvo. ${JSON.stringify({
        blockers: providerSulfurValidation.blockers,
        expectedKgSPerHa: providerSulfurValidation.expectedKgSPerHa,
      })}`,
      502,
    );
  }

  const providerNitrogenValidation = validatePrescriptionNitrogenRecommendation({
    recommendations,
    deterministicEvidence: evidence.deterministicNitrogenEvidence,
  });
  if (!providerNitrogenValidation.allowed) {
    throw new AiGenerationError(
      `A resposta do provedor divergiu da execução determinística corrente de nitrogênio da RAIZ. A geração foi descartada e nada foi salvo. ${JSON.stringify({
        blockers: providerNitrogenValidation.blockers,
        expectedKgNPerHa: providerNitrogenValidation.expectedKgNPerHa,
      })}`,
      502,
    );
  }


  const providerLimingValidation = validatePrescriptionLimingRecommendation({
    recommendations,
    deterministicDecision: evidence.deterministicLimingDecision,
  });
  if (!providerLimingValidation.allowed) {
    throw new AiGenerationError(
      `A resposta do provedor divergiu da regra determinística de calagem da RAIZ. A geração foi descartada e nada foi salvo. ${JSON.stringify({
        blockers: providerLimingValidation.blockers,
        expectedTonHaPrnt100: providerLimingValidation.expectedTonHaPrnt100,
      })}`,
      502,
    );
  }

  const previous = await getLatestAgronomicPrescription(input.tenantId, input.analysisId, input.userId);
  const created = await recordAgronomicPrescriptionGenerationSafely({
    tenantId: input.tenantId,
    userId: input.userId,
    analysisId: input.analysisId,
    interpretationId: interpretationAfterProvider.id,
    expectedSeasonUpdatedAt: contextAfterProvider.updatedAt,
    expectedAnalysisContextFingerprint: evidence.analysis.contextFingerprint,
    expectedNitrogenExecutionId: evidence.deterministicNitrogenEvidence.executionId,
    provider: result.provider,
    model: result.model,
    promptVersion: result.promptVersion,
    requestPayload: { evidence },
    responsePayload: { prescription: result.prescription, isRealLanguageModel: result.isRealLanguageModel },
    tokensUsed: result.tokensUsed ?? null,
    costUsd: result.costUsd ?? null,
    supersedes: previous?.status === "CHANGES_REQUESTED" ? previous.id : null,
  });

  let generation = created;
  if (!result.isRealLanguageModel) {
    const validated = await reviewAgronomicPrescriptionSafely({
      tenantId: input.tenantId,
      userId: input.userId,
      generationId: created.id,
      decision: "APPROVED",
      note: "RAIZ_ENGINE_AUTO_VALIDATED",
    });
    generation = { ...created, status: validated.status };
  }

  return {
    generation,
    prescription: result.prescription,
    isRealLanguageModel: result.isRealLanguageModel,
  };
}
