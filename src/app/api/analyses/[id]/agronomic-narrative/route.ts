import { getPlatformSession } from "@/lib/auth/session";
import { buildAgronomicEvidencePackage } from "@/lib/ai/evidence-package";
import { resolveAgronomicExplanationProvider } from "@/lib/ai/agronomic-explanation-provider";
import { validateAgronomicNarrative } from "@/lib/ai/agronomic-narrative-schema";
import { recordAgronomicNarrativeGeneration, getLatestAgronomicNarrative, listAgronomicNarrativeHistory } from "@/lib/repositories/ai-generations";
import { getLatestInterpretation } from "@/lib/repositories/interpretations";

const runRoles = new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST", "FIELD_TECH"]);

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  const { id } = await context.params;
  const [latest, history] = await Promise.all([
    getLatestAgronomicNarrative(session.tenantId, id, session.userId),
    listAgronomicNarrativeHistory(session.tenantId, id, session.userId),
  ]);
  return Response.json({ latest, history });
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

  const interpretation = await getLatestInterpretation(session.tenantId, id, session.userId);
  const provider = resolveAgronomicExplanationProvider();
  const result = await provider.explain({ evidence, audience: "AGRONOMO" });
  const narrative = validateAgronomicNarrative(result.narrative);
  if (!narrative) return Response.json({ error: "O provedor de IA devolveu um formato inválido — resposta descartada, nada foi salvo." }, { status: 502 });

  const previous = await getLatestAgronomicNarrative(session.tenantId, id, session.userId);
  const created = await recordAgronomicNarrativeGeneration({
    tenantId: session.tenantId,
    userId: session.userId,
    analysisId: id,
    interpretationId: interpretation?.id ?? null,
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
}
