import { getPlatformSession } from "@/lib/auth/session";
import type { OperationalAssistantResponse } from "@/lib/ai/operational-assistant-provider";
import { parseAssistantScreenContext, parseAssistantScreenState, INVALID_SCREEN_CONTEXT } from "@/lib/ai/assistant-screen";
import { buildAssistantEvidence, type AssistantEvidenceResult } from "@/lib/ai/assistant-evidence";
import { buildEvidenceManifest } from "@/lib/ai/assistant-evidence-manifest";
import { validateAssistantActions } from "@/lib/ai/assistant-actions";
import type { ResolvedAssistantAction } from "@/lib/ai/assistant-actions-schema";
import { recordOperationalAssistantGeneration } from "@/lib/repositories/ai-generations";
import { withQueryCounting } from "@/lib/db-query-count";
import { sanitizeLegacyCards } from "@/lib/ai/assistant-response-schema";
import { routeAssistantRequest } from "@/lib/ai/assistant-provider-router";
import { resolveGenerativeProvider } from "@/lib/ai/assistant-generative-provider-resolver";
import { localIntentAssistantProvider, LOCAL_INTENT_PROMPT_VERSION } from "@/lib/ai/providers/local-intent-assistant-provider";
import { geminiOperationalAssistantProvider, GEMINI_ASSISTANT_PROMPT_VERSION } from "@/lib/ai/providers/gemini-operational-assistant-provider";

// Fase 4G -- versão do "prompt" (contrato de comportamento) registrada na auditoria reflete quem REALMENTE
// respondeu (`result.provider`), não mais um valor fixo assumindo sempre o local -- agora que o router
// (item 3) pode devolver uma resposta de um provider generativo aprovado pelo Grounding Gate.
const PROMPT_VERSIONS_BY_PROVIDER: Record<string, string> = {
  [localIntentAssistantProvider.name]: LOCAL_INTENT_PROMPT_VERSION,
  [geminiOperationalAssistantProvider.name]: GEMINI_ASSISTANT_PROMPT_VERSION,
};

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

  // Fase 4E, Bloco 1 -- `x-debug-query-count: 1` (nunca enviado pelo client real, só pelos testes de
  // medição) mede quantas consultas ESTE caminho pesado (Evidence Package completo) realmente executa,
  // pra comparar contra o caminho leve de `/api/assistant/context` (`resolveContextLabelLight`) com números
  // reais -- nunca afeta o contrato normal da resposta.
  const debugQueryCount = request.headers.get("x-debug-query-count") === "1";
  let evidenceQueryCount = 0;
  const evidence: AssistantEvidenceResult =
    parsedContext === INVALID_SCREEN_CONTEXT
      ? { found: false, kind: "invalid", entityIds: {} }
      : await (async () => {
          if (!debugQueryCount) return buildAssistantEvidence(session.tenantId, session.userId, parsedContext, screenState);
          const { result, queryCount } = await withQueryCounting(() => buildAssistantEvidence(session.tenantId, session.userId, parsedContext, screenState));
          evidenceQueryCount = queryCount;
          return result;
        })();

  // Fase 4G, item 3 -- roteamento explícito (local primeiro, generativo só quando o local diz
  // "unsupported" E o modo híbrido está ligado E há um provider generativo configurado). O provider
  // generativo em si é resolvido num arquivo à parte (`assistant-generative-provider-resolver.ts`) -- o
  // router nunca importa Gemini diretamente.
  const routed = await routeAssistantRequest(
    { question, tenantId: session.tenantId, userId: session.userId, role: session.role, screenContext, screenState, evidence },
    { generativeProvider: resolveGenerativeProvider() },
  );
  const result = routed.response;

  // Bloco 4 -- o provider só sugere `AssistantAction[]` (intenção tipada, ainda não confiada). Cada uma é
  // revalidada aqui: formato/allowlist, role da sessão, e posse/tenant reconferida no banco (nunca confia
  // no que "estava" no Evidence Package). Só o que sobrevive vira `ResolvedAssistantAction` com `href`
  // real -- é isso, e só isso, que chega ao client.
  const resolvedActions = await validateAssistantActions({ tenantId: session.tenantId, userId: session.userId, role: session.role }, result.suggested_actions);

  // Fase 4E, Bloco 3 -- `cards` (legado) só sobrevive quando o provider NÃO é um modelo de linguagem real.
  // Garantia categórica (não uma limpeza de href): um futuro provider generativo tem `cards` zerado
  // incondicionalmente, não importa o que ele tenha devolvido.
  const clientResponse: ClientAssistantResponse = { ...result, cards: sanitizeLegacyCards(result), suggested_actions: resolvedActions };

  // Pré-ajuste 1 (fechamento final da Fase 4A): o manifesto precisa distinguir Dashboard real de contexto
  // inválido -- `screenContext ?? {type:"dashboard"}` registraria uma tentativa inválida como se tivesse
  // acontecido no Dashboard. Aqui `{type:"invalid"}` é explícito, nunca inferido por ausência.
  const evidenceManifest = buildEvidenceManifest({
    screenContext: parsedContext === INVALID_SCREEN_CONTEXT ? { type: "invalid" } : parsedContext,
    evidenceResult: evidence,
    factsUsed: result.facts,
    extraRuleRefs: result.patterns.map((p) => p.ruleRef),
  });

  // Bloco 6 (Fase 4) -- auditoria completa, tudo dentro do jsonb já existente de `ai_generations` (nenhuma
  // coluna nova, nenhuma migration): pergunta, contexto/estado JÁ VALIDADOS (nunca o corpo cru não
  // confiável), evidence manifest, ações SUGERIDAS (cru, o que o provider propôs) e ações RESOLVIDAS (o
  // que efetivamente sobreviveu à validação) como campos distintos.
  //
  // Fase 4G, item 7 -- `routing` registra a história completa do roteamento pra cada pergunta: modo,
  // se o local resolveu sozinho, se escalonou pra um generativo, o resultado dessa tentativa (aprovado/
  // reprovado pelo gate/erro/timeout/limite atingido), provider/modelo/latência/tokens de QUALQUER
  // tentativa generativa (mesmo quando ela falhou e caiu no fallback) -- nunca custo inventado quando não
  // há tabela de preço real configurada (`costUsd` só é gravado quando o provider devolve um valor real).
  // Isto fica SÓ na auditoria -- nunca no `clientResponse` abaixo (item 8: o cliente nunca vê detalhe de
  // provider/erro técnico externo).
  await recordOperationalAssistantGeneration({
    tenantId: session.tenantId,
    userId: session.userId,
    provider: result.provider,
    model: result.model,
    promptVersion: PROMPT_VERSIONS_BY_PROVIDER[result.provider] ?? "unknown",
    requestPayload: { question, screenContext, screenState, evidenceManifest },
    responsePayload: { ...result, suggested_actions: result.suggested_actions, resolved_actions: resolvedActions, routing: routed.routing },
    status: result.requires_professional_review ? "PENDING_REVIEW" : "APPROVED",
  });

  return Response.json({ ...clientResponse, ...(debugQueryCount ? { _debugEvidenceQueryCount: evidenceQueryCount } : {}) });
}
