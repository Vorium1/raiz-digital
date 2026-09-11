import { getPlatformSession } from "@/lib/auth/session";
import { resolveOperationalAssistantProvider } from "@/lib/ai/operational-assistant-provider";
import type { AssistantScreenContext, AssistantScreenState } from "@/lib/ai/assistant-screen";
import { buildAssistantEvidence, buildEvidenceManifest } from "@/lib/ai/assistant-evidence";
import { recordOperationalAssistantGeneration } from "@/lib/repositories/ai-generations";

const VALID_CONTEXT_TYPES = new Set(["dashboard", "property", "field", "analysis", "intelligence", "map", "comparison", "report-field", "report-property"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Fase 4A, Bloco 0/1/2/3: parsing defensivo do corpo -- NUNCA confia em `type`/`id`/valores de estado
 * enviados pelo client como se já fossem válidos (Correção 4 da arquitetura). Isso só decide QUAL builder
 * roda a seguir; a autorização de verdade acontece dentro de cada builder (`withTenant` + a mesma consulta
 * que a própria página faria), nunca aqui.
 */
function parseScreenContext(raw: unknown): AssistantScreenContext {
  const body = raw as Record<string, unknown> | undefined;
  const type = typeof body?.type === "string" ? body.type : undefined;
  if (!type || !VALID_CONTEXT_TYPES.has(type)) return { type: "dashboard" };
  const id = typeof body?.id === "string" ? body.id : undefined;
  if (type === "dashboard" || type === "intelligence" || type === "map" || type === "comparison") return { type } as AssistantScreenContext;
  // property/field/analysis/report-field/report-property exigem um id no formato certo -- um id malformado
  // (nunca confiado como uuid real) cai pro dashboard em vez de virar consulta com entrada inválida.
  if (!id || !UUID.test(id)) return { type: "dashboard" };
  return { type, id } as AssistantScreenContext;
}

function parseScreenState(raw: unknown): AssistantScreenState | undefined {
  const body = raw as Record<string, unknown> | undefined;
  const screen = typeof body?.screen === "string" ? body.screen : undefined;
  const str = (key: string) => (typeof body?.[key] === "string" ? (body![key] as string) : undefined);
  if (screen === "map") {
    const status = str("status");
    return { screen: "map", collectionOrderId: str("collectionOrderId"), parameter: str("parameter"), status: status === "collected" || status === "pending" || status === "all" ? status : undefined, satellite: body?.satellite === true };
  }
  if (screen === "comparison") {
    const mode = str("mode");
    return { screen: "comparison", mode: mode === "fields" || mode === "seasons" || mode === "points" || mode === "properties" ? mode : undefined, a: str("a"), b: str("b") };
  }
  if (screen === "intelligence") {
    return { screen: "intelligence", clientId: str("clientId"), propertyId: str("propertyId"), fieldId: str("fieldId"), seasonId: str("seasonId"), interpretationState: str("interpretationState"), reviewState: str("reviewState") };
  }
  return undefined;
}

export async function POST(request: Request) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) return Response.json({ error: "Digite uma pergunta." }, { status: 400 });

  // Contexto sempre construído no servidor a partir da sessão -- nunca aceita tenantId do corpo da
  // requisição (Bloco 0: `session.tenantId`/`session.userId` são a ÚNICA fonte de tenant/usuário daqui em
  // diante; qualquer `tenantId` que o corpo eventualmente carregasse é ignorado, nunca lido).
  const screenContext = parseScreenContext(body.screenContext);
  const screenState = parseScreenState(body.screenState);

  const evidence = await buildAssistantEvidence(session.tenantId, session.userId, screenContext, screenState);

  const provider = resolveOperationalAssistantProvider();
  const result = await provider.ask({ question, tenantId: session.tenantId, userId: session.userId, role: session.role, screenContext, screenState, evidence });

  const evidenceManifest = buildEvidenceManifest({
    screenContext,
    entityIds: evidence.entityIds,
    evidence: evidence.found ? (evidence as any).evidence : null,
    factsUsed: result.facts,
  });

  await recordOperationalAssistantGeneration({
    tenantId: session.tenantId,
    userId: session.userId,
    provider: result.provider,
    model: result.model,
    promptVersion: "local-intent-v2-structured",
    requestPayload: { question, screenContext, screenState, evidenceManifest },
    responsePayload: result,
    status: result.requires_professional_review ? "PENDING_REVIEW" : "APPROVED",
  });

  return Response.json(result);
}
