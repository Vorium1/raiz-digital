import { getPlatformSession } from "@/lib/auth/session";
import { buildAgronomicPrescriptionEvidencePackage } from "@/lib/ai/prescription-evidence-package";
import { resolveAgronomicPrescriptionProvider } from "@/lib/ai/agronomic-prescription-provider";
import { getLatestInterpretation } from "@/lib/repositories/interpretations";
import { getLatestAgronomicPrescription, listAgronomicPrescriptionHistory, recordAgronomicPrescriptionGeneration } from "@/lib/repositories/ai-generations";
import { getTenantPrescriptionUsage } from "@/lib/repositories/tenant-plan";
import { getRecommendationContextByAnalysis } from "@/lib/repositories/recommendation-context";
import { checkPrescriptionGate } from "@/domain/agronomic-prescription-gate";
import { evaluatePrescriptionContextFreshness } from "@/domain/prescription-context-freshness";

const runRoles = new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST", "FIELD_TECH"]);

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
  const prescriptionFreshness = latest
    ? evaluatePrescriptionContextFreshness({ generationCreatedAt: latest.createdAt, cropSeasonUpdatedAt: recommendationContext.updatedAt })
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
      recommendationContext: {
        cropSeasonId: recommendationContext.cropSeasonId,
        yieldGoal: recommendationContext.yieldGoal,
        yieldGoalUnit: recommendationContext.yieldGoalUnit,
        technologyLevel: recommendationContext.technologyLevel,
        cultivationOrderAfterSoilAnalysis: recommendationContext.cultivationOrderAfterSoilAnalysis,
        updatedAt: recommendationContext.updatedAt,
        pkDoseReadiness: recommendationContext.pkDoseReadiness,
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

  // Governança obrigatória:
  // interpretação determinística -> revisão profissional -> APPROVED -> prescrição assistida
  // -> revisão/aprovação da prescrição. Nenhuma IA pula a decisão humana anterior.
  const [interpretation, contextBeforeProvider] = await Promise.all([
    getLatestInterpretation(session.tenantId, id, session.userId),
    getRecommendationContextByAnalysis({ tenantId: session.tenantId, userId: session.userId, analysisId: id }),
  ]);
  const gate = checkPrescriptionGate(interpretation?.status ?? null);
  if (!gate.allowed) {
    return Response.json({ error: gate.reason }, { status: 409 });
  }

  // O pacote foi montado em uma transação separada. Se a revisão determinística OU o contexto da safra
  // mudou entre a leitura das evidências e este ponto, não enviamos um snapshot antigo ao provedor.
  if (
    !evidence.deterministicInterpretation
    || evidence.deterministicInterpretation.id !== interpretation?.id
    || evidence.deterministicInterpretation.status !== "APPROVED"
    || evidence.season.updatedAt !== contextBeforeProvider.updatedAt
  ) {
    return Response.json({ error: "As evidências agronômicas mudaram durante a preparação da prescrição. Atualize a análise e gere novamente a partir da revisão e do contexto atuais." }, { status: 409 });
  }

  const provider = resolveAgronomicPrescriptionProvider();

  let result;
  try {
    result = await provider.prescribe({ evidence });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Falha ao gerar prescrição." }, { status: 502 });
  }

  // O provedor pode levar alguns segundos. Revalidamos DEPOIS da chamada para fechar a janela em que
  // um agrônomo poderia alterar a safra ou gerar/revisar uma nova interpretação enquanto a IA respondia.
  // Se isso aconteceu, descartamos a resposta como geração corrente; nada é promovido nem persistido.
  const [interpretationAfterProvider, contextAfterProvider] = await Promise.all([
    getLatestInterpretation(session.tenantId, id, session.userId),
    getRecommendationContextByAnalysis({ tenantId: session.tenantId, userId: session.userId, analysisId: id }),
  ]);
  if (
    evidence.deterministicInterpretation.id !== interpretationAfterProvider?.id
    || interpretationAfterProvider?.status !== "APPROVED"
    || evidence.season.updatedAt !== contextAfterProvider.updatedAt
  ) {
    return Response.json({ error: "A interpretação ou o contexto da safra mudou enquanto a recomendação era gerada. A resposta antiga foi descartada; gere novamente com as evidências atuais." }, { status: 409 });
  }

  const previous = await getLatestAgronomicPrescription(session.tenantId, id, session.userId);
  const created = await recordAgronomicPrescriptionGeneration({
    tenantId: session.tenantId,
    userId: session.userId,
    analysisId: id,
    interpretationId: interpretationAfterProvider.id,
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
