import { checkPrescriptionDraftGate } from "@/domain/agronomic-prescription-gate";
import { validatePrescriptionPkRecommendations, type PrescriptionRecommendationCandidate } from "@/domain/prescription-pk-validation";
import { computeDeterministicPkDose, evaluateUniformPkReadiness } from "@/domain/uniform-pk-readiness";
import { getPlatformSession } from "@/lib/auth/session";
import { getAnalysisEvidenceState } from "@/lib/repositories/analysis-evidence";
import { AiGenerationError, getLatestAgronomicPrescription, listAgronomicPrescriptionHistory } from "@/lib/repositories/ai-generations";
import { getLatestInterpretation } from "@/lib/repositories/interpretations";
import { getAgronomicPrescriptionFreshness } from "@/lib/repositories/prescription-freshness";
import { getRecommendationContextByAnalysis } from "@/lib/repositories/recommendation-context";
import { getTenantPrescriptionUsage } from "@/lib/repositories/tenant-plan";
import { prepareAgronomicPrescriptionDraft } from "@/lib/workflows/agronomic-prescription-draft";

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
  const [latest, history, usage, interpretation, recommendationContext, analysisEvidence] = await Promise.all([
    getLatestAgronomicPrescription(session.tenantId, id, session.userId),
    listAgronomicPrescriptionHistory(session.tenantId, id, session.userId),
    getTenantPrescriptionUsage(session.tenantId),
    getLatestInterpretation(session.tenantId, id, session.userId),
    getRecommendationContextByAnalysis({ tenantId: session.tenantId, userId: session.userId, analysisId: id }),
    getAnalysisEvidenceState({ tenantId: session.tenantId, userId: session.userId, analysisId: id }),
  ]);
  const gate = checkPrescriptionDraftGate(interpretation?.status ?? null);
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

  const evidenceCurrent = analysisEvidence.interpretationId === interpretation?.id && analysisEvidence.freshness.current;
  return Response.json({
    latest,
    history,
    usage,
    readiness: {
      allowed: gate.allowed && evidenceCurrent,
      reason: !gate.allowed ? gate.reason : evidenceCurrent ? null : analysisEvidence.freshness.reason,
      interpretationStatus: interpretation?.status ?? null,
      interpretationId: interpretation?.id ?? null,
      interpretationEvidenceFreshness: analysisEvidence.freshness,
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

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  if (!runRoles.has(session.role)) return Response.json({ error: "Seu perfil não pode gerar prescrição assistida por IA." }, { status: 403 });
  const { id } = await context.params;
  const deterministicMode = new URL(request.url).searchParams.get("mode") === "deterministic";

  try {
    const result = await prepareAgronomicPrescriptionDraft({
      tenantId: session.tenantId,
      userId: session.userId,
      analysisId: id,
      mode: deterministicMode ? "deterministic" : "default",
    });
    return Response.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof AiGenerationError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível preparar o rascunho da recomendação." }, { status: 422 });
  }
}
