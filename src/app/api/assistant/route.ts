import { getPlatformSession } from "@/lib/auth/session";
import { resolveOperationalAssistantProvider } from "@/lib/ai/operational-assistant-provider";
import { parseAssistantScreenContext, parseAssistantScreenState, INVALID_SCREEN_CONTEXT } from "@/lib/ai/assistant-screen";
import { buildAssistantEvidence, type AssistantEvidenceResult } from "@/lib/ai/assistant-evidence";
import { buildEvidenceManifest } from "@/lib/ai/assistant-evidence-manifest";
import { recordOperationalAssistantGeneration } from "@/lib/repositories/ai-generations";

export async function POST(request: Request) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) return Response.json({ error: "Digite uma pergunta." }, { status: 400 });

  // Contexto sempre construído no servidor a partir da sessão -- nunca aceita tenantId do corpo da
  // requisição (Bloco 0: `session.tenantId`/`session.userId` são a ÚNICA fonte de tenant/usuário daqui em
  // diante; qualquer `tenantId` que o corpo eventualmente carregasse é ignorado, nunca lido).
  //
  // Fechamento técnico (2º pedido, item 2): `parseAssistantScreenContext` distingue ausência legítima de
  // contexto (nada enviado -> `{type:"dashboard"}`, contexto global correto) de contexto explicitamente
  // informado porém inválido/malformado (-> `INVALID_SCREEN_CONTEXT`) -- este último NUNCA vira dashboard
  // silenciosamente, monta uma evidência `kind: "invalid"` explícita em vez de chamar
  // `buildAssistantEvidence`, e o provider (ver `local-intent-assistant-provider.ts`) responde com uma
  // mensagem honesta em vez de narrar a operação inteira como se fosse o contexto pedido.
  const parsedContext = parseAssistantScreenContext(body.screenContext);
  const screenState = parseAssistantScreenState(body.screenState);
  const screenContext = parsedContext === INVALID_SCREEN_CONTEXT ? undefined : parsedContext;

  const evidence: AssistantEvidenceResult =
    parsedContext === INVALID_SCREEN_CONTEXT
      ? { found: false, kind: "invalid", entityIds: {} }
      : await buildAssistantEvidence(session.tenantId, session.userId, parsedContext, screenState);

  const provider = resolveOperationalAssistantProvider();
  const result = await provider.ask({ question, tenantId: session.tenantId, userId: session.userId, role: session.role, screenContext, screenState, evidence });

  const evidenceManifest = buildEvidenceManifest({
    // Registra o contexto REALMENTE resolvido (dashboard/inválido) pra auditoria refletir o que de fato
    // aconteceu, nunca o valor cru não-validado que o corpo mandou.
    screenContext: screenContext ?? { type: "dashboard" },
    evidenceResult: evidence,
    factsUsed: result.facts,
    extraRuleRefs: result.patterns.map((p) => p.ruleRef),
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
