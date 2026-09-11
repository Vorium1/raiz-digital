import { getPlatformSession } from "@/lib/auth/session";
import { resolveOperationalAssistantProvider, type OperationalAssistantResponse } from "@/lib/ai/operational-assistant-provider";
import { parseAssistantScreenContext, parseAssistantScreenState, INVALID_SCREEN_CONTEXT } from "@/lib/ai/assistant-screen";
import { buildAssistantEvidence, type AssistantEvidenceResult } from "@/lib/ai/assistant-evidence";
import { buildEvidenceManifest } from "@/lib/ai/assistant-evidence-manifest";
import { validateAssistantActions } from "@/lib/ai/assistant-actions";
import type { ResolvedAssistantAction } from "@/lib/ai/assistant-actions-schema";
import { recordOperationalAssistantGeneration } from "@/lib/repositories/ai-generations";

const PROMPT_VERSION = "local-intent-v3-actions";

/** O que realmente trafega pro client: `suggested_actions` SEMPRE trocado pela versão já validada/resolvida
 *  (`ResolvedAssistantAction[]`) -- o que o provider sugeriu cru nunca sai do servidor. */
type ClientAssistantResponse = Omit<OperationalAssistantResponse, "suggested_actions"> & { suggested_actions: ResolvedAssistantAction[] };

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

  // Bloco 4 -- o provider só sugere `AssistantAction[]` (intenção tipada, ainda não confiada). Cada uma é
  // revalidada aqui: formato/allowlist, role da sessão, e posse/tenant reconferida no banco (nunca confia
  // no que "estava" no Evidence Package). Só o que sobrevive vira `ResolvedAssistantAction` com `href`
  // real -- é isso, e só isso, que chega ao client.
  const resolvedActions = await validateAssistantActions({ tenantId: session.tenantId, userId: session.userId, role: session.role }, result.suggested_actions);

  const clientResponse: ClientAssistantResponse = { ...result, suggested_actions: resolvedActions };

  // Pré-ajuste 1 (fechamento final da Fase 4A): o manifesto precisa distinguir Dashboard real de contexto
  // inválido -- `screenContext ?? {type:"dashboard"}` registraria uma tentativa inválida como se tivesse
  // acontecido no Dashboard. Aqui `{type:"invalid"}` é explícito, nunca inferido por ausência.
  const evidenceManifest = buildEvidenceManifest({
    screenContext: parsedContext === INVALID_SCREEN_CONTEXT ? { type: "invalid" } : parsedContext,
    evidenceResult: evidence,
    factsUsed: result.facts,
    extraRuleRefs: result.patterns.map((p) => p.ruleRef),
  });

  // Bloco 6 -- auditoria completa, tudo dentro do jsonb já existente de `ai_generations` (nenhuma coluna
  // nova, nenhuma migration): pergunta, contexto/estado JÁ VALIDADOS (nunca o corpo cru não confiável),
  // evidence manifest, ações SUGERIDAS (cru, o que o provider propôs) e ações RESOLVIDAS (o que
  // efetivamente sobreviveu à validação) como campos distintos -- nunca só um dos dois, pra auditoria
  // conseguir diferenciar "o que o provider tentou sugerir" de "o que realmente foi oferecido ao usuário".
  await recordOperationalAssistantGeneration({
    tenantId: session.tenantId,
    userId: session.userId,
    provider: result.provider,
    model: result.model,
    promptVersion: PROMPT_VERSION,
    requestPayload: { question, screenContext, screenState, evidenceManifest },
    responsePayload: { ...result, suggested_actions: result.suggested_actions, resolved_actions: resolvedActions },
    status: result.requires_professional_review ? "PENDING_REVIEW" : "APPROVED",
  });

  return Response.json(clientResponse);
}
