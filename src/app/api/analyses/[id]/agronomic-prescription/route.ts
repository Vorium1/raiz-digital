import { getPlatformSession } from "@/lib/auth/session";
import { buildAgronomicPrescriptionEvidencePackage } from "@/lib/ai/prescription-evidence-package";
import { resolveAgronomicPrescriptionProvider } from "@/lib/ai/agronomic-prescription-provider";
import { getLatestInterpretation } from "@/lib/repositories/interpretations";
import { getLatestAgronomicPrescription, listAgronomicPrescriptionHistory, recordAgronomicPrescriptionGeneration } from "@/lib/repositories/ai-generations";
import { getTenantPrescriptionUsage } from "@/lib/repositories/tenant-plan";
import { getRecommendationContextByAnalysis } from "@/lib/repositories/recommendation-context";
import { getAgronomicPrescriptionFreshness } from "@/lib/repositories/prescription-freshness";
import { checkPrescriptionGate } from "@/domain/agronomic-prescription-gate";
import { evaluatePrescriptionSnapshotConsistency } from "@/domain/prescription-snapshot-consistency";
import { computeDeterministicPkDose, evaluateUniformPkReadiness } from "@/domain/uniform-pk-readiness";
import { validatePrescriptionPkRecommendations, type PrescriptionRecommendationCandidate } from "@/domain/prescription-pk-validation";

const runRoles = new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST", "FIELD_TECH"]);

function interpretationItems(structuredOutput: unknown) {
  if (!structuredOutput || typeof structuredOutput !== "object" || Array.isArray(structuredOutput)) return [];
  const value = (structuredOutput as { interpretation?: unknown }).interpretation;
  return Array.isArray(value) ? value : [];
}

function prescriptionRecommendations(responsePayload: unknown): PrescriptionRecommendationCandidate[] {
  if (!responsePayload || typeof responsePayload !== "object" || Array.isArray(responsePayload)) return [];
  const prescription = (responsePayload as { prescription?: unknown }).prescription;
  if (!prescription || typeof prescription !== "object" || Array.isArray(prescription)) return [];
  const recommendations = (prescription as { recommendations?: unknown }).recommendations;
  return Array.isArray(recommendations) ? recommendations as PrescriptionRecommendationCandidate[] : [];
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  const { id } = await context.params;
  const [latest, history, usage, interpretation, recommendationContext] = await Promise.all([
    getLatestAgronomicPrescription(session.tenantId, id, session.userId),
    listAgronomicPrescriptionHistory(session.tenantId, id, session.userId),
    getTenantPrescriptionUsage(session.tenantId),
    getLatestInterpretation(session.tenantId, id, session.userId),
    getRecommendationContextByAnalysis({ tenantId: session.tenantId, userId: session.userId, analysisId: id }),
  ]);
  const gate = checkPrescriptionGate(interpretation?.status ?? null);
  const prescriptionFreshness = await getAgronomicPrescriptionFreshness({
    tenantId: session.tenantId,
    userId: session.userId,
    analysisId: id,
    generationId: latest?.id,
  });
  const interpreted = interpretationItems(interpretation?.structuredOutput);
  const uniformPkReadiness = evaluateUniformPkReadiness({
    cropCode: recommendationContext.cropProfileCode,
    interpretation: interpreted,
  });
  const deterministicPkDoses = {
    P2O5: computeDeterministicPkDose({
      cropCode: recommendationContext.cropProfileCode,
      interpretation: interpreted,
      yieldGoal: recommendationContext.yieldGoal,
      yieldGoalUnit: recommendationContext.yieldGoalUnit,
      cultivationOrderAfterSoilAnalysis: recommendationContext.cultivationOrderAfterSoilAnalysis,
      nutrient: "P2O5",
    }),
    K2O: computeDeterministicPkDose({
      cropCode: recommendationContext.cropProfileCode,
      interpretation: interpreted,
      yieldGoal: recommendationContext.yieldGoal,
      yieldGoalUnit: recommendationContext.yieldGoalUnit,
      cultivationOrderAfterSoilAnalysis: recommendationContext.cultivationOrderAfterSoilAnalysis,
      nutrient: "K2O",
    }),
  };
  const prescriptionPkValidation = latest
    ? validatePrescriptionPkRecommendations({
        recommendations: prescriptionRecommendations(latest.responsePayload),
        cropCode: recommendationContext.cropProfileCode,
        interpretation: interpreted,
        yieldGoal: recommendationContext.yieldGoal,
        yieldGoalUnit: recommendationContext.yieldGoalUnit,
        cultivationOrderAfterSoilAnalysis: recommendationContext.cultivationOrderAfterSoilAnalysis,
      })
    : null;

  return Response.json({
    latest,
    history,
    usage,
    readiness: {
      allowed: gate.allowed,
      reason: gate.allowed ? null : gate.reason,
      interpretationStatus: interpretation?.status ?? null,
      interpretationId: interpretation?.id ?? null,
      prescriptionFreshness,
      prescriptionPkValidation,
      recommendationContext: {
        cropSeasonId: recommendationContext.cropSeasonId,
        yieldGoal: recommendationContext.yieldGoal,
        yieldGoalUnit: recommendationContext.yieldGoalUnit,
        technologyLevel: recommendationContext.technologyLevel,
        cultivationOrderAfterSoilAnalysis: recommendationContext.cultivationOrderAfterSoilAnalysis,
        cropProfileCode: recommendationContext.cropProfileCode,
        updatedAt: recommendationContext.updatedAt,
        pkDoseReadiness: recommendationContext.pkDoseReadiness,
        uniformPkReadiness,
        deterministicPkDoses,
      },
    },
  });
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  if (!runRoles.has(session.role)) return Response.json({ error: "Seu perfil não pode gerar prescrição assistida por IA." }, { status: 403 });
  const { id } = await context.params;

  const usage = await getTenantPrescriptionUsage(session.tenantId);
  if (usage.usedThisMonth >= usage.monthlyLimit) {
    return Response.json({ error: `Limite mensal de prescrições por IA atingido (${usage.usedThisMonth}/${usage.monthlyLimit} este mês). Fale com o responsável pela plataforma para ajustar o plano.` }, { status: 429 });
  }

  const evidence = await buildAgronomicPrescriptionEvidencePackage(session.tenantId, session.userId, id);
  if (!evidence) return Response.json({ error: "Análise não encontrada." }, { status: 404 });
  if (evidence.results.length === 0) {
    return Response.json({ error: "Não há resultado de laboratório vinculado a esta análise ainda." }, { status: 409 });
  }

  const [interpretation, contextBeforeProvider] = await Promise.all([
    getLatestInterpretation(session.tenantId, id, session.userId),
    getRecommendationContextByAnalysis({ tenantId: session.tenantId, userId: session.userId, analysisId: id }),
  ]);
  const gate = checkPrescriptionGate(interpretation?.status ?? null);
  if (!gate.allowed) {
    return Response.json({ error: gate.reason }, { status: 409 });
  }

  const beforeProvider = evaluatePrescriptionSnapshotConsistency({
    snapshotSeasonUpdatedAt: evidence.season.updatedAt,
    currentSeasonUpdatedAt: contextBeforeProvider.updatedAt,
    snapshotInterpretationId: evidence.deterministicInterpretation?.id,
    currentInterpretationId: interpretation?.id,
    currentInterpretationStatus: interpretation?.status,
  });
  if (!beforeProvider.current) {
    return Response.json({ error: `${beforeProvider.reason ?? "As evidências agronômicas mudaram."} Atualize a análise e gere novamente a partir do contexto atual.` }, { status: 409 });
  }

  const provider = resolveAgronomicPrescriptionProvider();

  let result;
  try {
    result = await provider.prescribe({ evidence });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Falha ao gerar prescrição." }, { status: 502 });
  }

  const [interpretationAfterProvider, contextAfterProvider] = await Promise.all([
    getLatestInterpretation(session.tenantId, id, session.userId),
    getRecommendationContextByAnalysis({ tenantId: session.tenantId, userId: session.userId, analysisId: id }),
  ]);
  const afterProvider = evaluatePrescriptionSnapshotConsistency({
    snapshotSeasonUpdatedAt: evidence.season.updatedAt,
    currentSeasonUpdatedAt: contextAfterProvider.updatedAt,
    snapshotInterpretationId: evidence.deterministicInterpretation?.id,
    currentInterpretationId: interpretationAfterProvider?.id,
    currentInterpretationStatus: interpretationAfterProvider?.status,
  });
  if (!afterProvider.current) {
    return Response.json({ error: `${afterProvider.reason ?? "As evidências agronômicas mudaram."} A resposta antiga foi descartada; gere novamente com as evidências atuais.` }, { status: 409 });
  }

  // Prompt não é barreira de segurança. Antes de persistir, qualquer P2O5/K2O devolvido pelo provedor
  // é recalculado no servidor. Dose inventada, P/K elemental ambíguo, duplicidade ou tentativa de
  // contornar heterogeneidade descarta a resposta inteira; nada chega a PENDING_REVIEW.
  const providerPkValidation = validatePrescriptionPkRecommendations({
    recommendations: result.prescription.recommendations,
    cropCode: contextAfterProvider.cropProfileCode,
    interpretation: interpretationItems(interpretationAfterProvider?.structuredOutput),
    yieldGoal: contextAfterProvider.yieldGoal,
    yieldGoalUnit: contextAfterProvider.yieldGoalUnit,
    cultivationOrderAfterSoilAnalysis: contextAfterProvider.cultivationOrderAfterSoilAnalysis,
  });
  if (!providerPkValidation.allowed) {
    return Response.json({
      error: "A resposta do provedor tentou propor P/K fora do motor determinístico da RAIZ. A geração foi descartada e nada foi salvo.",
      blockers: providerPkValidation.failures.map((failure) => ({
        inputType: failure.inputType,
        nutrient: failure.nutrient,
        blockers: failure.blockers,
        expected: failure.validation?.expected ?? null,
      })),
    }, { status: 502 });
  }

  const previous = await getLatestAgronomicPrescription(session.tenantId, id, session.userId);
  const created = await recordAgronomicPrescriptionGeneration({
    tenantId: session.tenantId,
    userId: session.userId,
    analysisId: id,
    interpretationId: interpretationAfterProvider?.id ?? null,
    provider: result.provider,
    model: result.model,
    promptVersion: result.promptVersion,
    requestPayload: { evidence },
    responsePayload: { prescription: result.prescription, isRealLanguageModel: result.isRealLanguageModel },
    tokensUsed: result.tokensUsed ?? null,
    costUsd: result.costUsd ?? null,
    supersedes: previous?.status === "CHANGES_REQUESTED" ? previous.id : null,
  });

  return Response.json({ generation: created, prescription: result.prescription, isRealLanguageModel: result.isRealLanguageModel }, { status: 201 });
}
