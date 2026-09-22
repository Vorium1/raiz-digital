import { getPlatformSession } from "@/lib/auth/session";
import { buildAgronomicEvidencePackage } from "@/lib/ai/evidence-package";
import { resolveAgronomicExplanationProvider } from "@/lib/ai/agronomic-explanation-provider";
import { validateAgronomicNarrative } from "@/lib/ai/agronomic-narrative-schema";
import { AiGenerationError, getLatestAgronomicNarrative, listAgronomicNarrativeHistory } from "@/lib/repositories/ai-generations";
import { getAnalysisEvidenceState } from "@/lib/repositories/analysis-evidence";
import { getLatestInterpretation } from "@/lib/repositories/interpretations";
import {
  getAgronomicNarrativeFreshness,
  recordAgronomicNarrativeGenerationSafely,
} from "@/lib/repositories/agronomic-narrative-safety";

const runRoles = new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST", "FIELD_TECH"]);

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  const { id } = await context.params;
  const [latest, history] = await Promise.all([
    getLatestAgronomicNarrative(session.tenantId, id, session.userId),
    listAgronomicNarrativeHistory(session.tenantId, id, session.userId),
  ]);
  const freshness = await getAgronomicNarrativeFreshness({
    tenantId: session.tenantId,
    userId: session.userId,
    analysisId: id,
    generationId: latest?.id,
  });
  return Response.json({ latest, history, freshness });
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  if (!runRoles.has(session.role)) return Response.json({ error: "Seu perfil não pode gerar síntese assistida por IA." }, { status: 403 });
  const { id } = await context.params;

  const evidence = await buildAgronomicEvidencePackage(session.tenantId, session.userId, id);
  if (!evidence) return Response.json({ error: "Análise não encontrada." }, { status: 404 });
  if (evidence.classifications.length === 0) {
    return Response.json({ error: "Rode o motor determinístico primeiro — a IA só explica uma interpretação já calculada, nunca o laudo cru." }, { status: 409 });
  }

  const [interpretation, evidenceBeforeProvider] = await Promise.all([
    getLatestInterpretation(session.tenantId, id, session.userId),
    getAnalysisEvidenceState({ tenantId: session.tenantId, userId: session.userId, analysisId: id }),
  ]);
  if (
    !interpretation?.id
    || evidence.interpretation?.id !== interpretation.id
    || evidenceBeforeProvider.interpretationId !== interpretation.id
    || !evidenceBeforeProvider.freshness.current
  ) {
    return Response.json({
      error: evidenceBeforeProvider.freshness.reason ?? "O laudo corrente precisa de uma nova interpretação antes da síntese assistida.",
    }, { status: 409 });
  }

  const provider = resolveAgronomicExplanationProvider();
  let result;
  try {
    result = await provider.explain({ evidence, audience: "AGRONOMO" });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Falha ao gerar síntese." }, { status: 502 });
  }
  const narrative = validateAgronomicNarrative(result.narrative);
  if (!narrative) return Response.json({ error: "O provedor de IA devolveu um formato inválido — resposta descartada, nada foi salvo." }, { status: 502 });

  // O provedor pode levar segundos. Releitura obrigatória antes de salvar evita persistir um texto gerado
  // sobre uma interpretação/laudo que deixou de ser o estado corrente enquanto a chamada estava em voo.
  const [interpretationAfterProvider, evidenceAfterProvider] = await Promise.all([
    getLatestInterpretation(session.tenantId, id, session.userId),
    getAnalysisEvidenceState({ tenantId: session.tenantId, userId: session.userId, analysisId: id }),
  ]);
  if (
    !interpretationAfterProvider?.id
    || evidence.interpretation?.id !== interpretationAfterProvider.id
    || interpretationAfterProvider.id !== interpretation.id
    || evidenceAfterProvider.interpretationId !== interpretationAfterProvider.id
    || !evidenceAfterProvider.freshness.current
  ) {
    return Response.json({
      error: `${evidenceAfterProvider.freshness.reason ?? "A evidência mudou durante a geração."} A resposta antiga foi descartada; gere novamente.`,
    }, { status: 409 });
  }

  const previous = await getLatestAgronomicNarrative(session.tenantId, id, session.userId);
  try {
    const created = await recordAgronomicNarrativeGenerationSafely({
      tenantId: session.tenantId,
      userId: session.userId,
      analysisId: id,
      interpretationId: interpretationAfterProvider.id,
      provider: result.provider,
      model: result.model,
      promptVersion: result.promptVersion,
      requestPayload: { evidence, audience: "AGRONOMO" },
      responsePayload: { narrative, isRealLanguageModel: result.isRealLanguageModel },
      tokensUsed: result.tokensUsed ?? null,
      costUsd: result.costUsd ?? null,
      supersedes: previous?.status === "CHANGES_REQUESTED" ? previous.id : null,
    });
    return Response.json({ generation: created, narrative, isRealLanguageModel: result.isRealLanguageModel }, { status: 201 });
  } catch (error) {
    if (error instanceof AiGenerationError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: error instanceof Error ? error.message : "A evidência mudou antes de salvar a síntese." }, { status: 409 });
  }
}
