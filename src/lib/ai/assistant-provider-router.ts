import type { OperationalAssistantProvider, OperationalAssistantRequest, OperationalAssistantResponse, AssistantHandlingResult } from "@/lib/ai/operational-assistant-provider";
import { localIntentAssistantProvider } from "@/lib/ai/providers/local-intent-assistant-provider";
import { buildEvidenceCatalog } from "@/lib/ai/assistant-evidence-catalog";
import { checkResponseGrounding } from "@/lib/ai/assistant-grounding-gate";
import { sanitizeLegacyCards } from "@/lib/ai/assistant-response-schema";
import { checkGenerativeUsageLimit, generativeTimeoutMs } from "@/lib/ai/assistant-usage-limits";

/**
 * Fase 4G, item 3 — camada de roteamento explícita entre o provider local (sempre disponível, obrigatório)
 * e um provider generativo OPCIONAL. Deliberadamente desacoplado do Gemini: trabalha só com o contrato
 * `OperationalAssistantProvider` -- quem decide QUAL provider generativo (se algum) injetar é o CHAMADOR
 * (`route.ts`, via `resolveGenerativeProvider()`), nunca este arquivo. Quando um `SelfHostedOperational
 * AssistantProvider` existir no futuro, plugá-lo aqui é só passar um objeto diferente em
 * `options.generativeProvider` -- nenhuma linha deste arquivo muda.
 *
 * Fluxo exato pedido:
 * pergunta -> Evidence Package (já resolvido antes de chegar aqui) -> provider local ->
 *   se `handling !== "unsupported"` -> resposta local, fim.
 *   se `handling === "unsupported"` E modo híbrido E provider generativo configurado E dentro do limite de
 *     uso -> chama o provider generativo (com timeout) -> Grounding Gate ->
 *       aprovado -> resposta generativa;
 *       reprovado/erro/timeout/limite -> fallback pro provider local (a mesma resposta que já tínhamos).
 *
 * Nunca "conserta" uma resposta reprovada -- troca pela resposta local inteira, a mesma garantia já
 * estabelecida em `grounded-operational-assistant-provider.ts` (Fase 4F), só que agora com telemetria rica
 * o bastante pra auditoria (item 7) sem precisar reimplementar a lógica em dois lugares.
 */

export type AssistantMode = "local" | "hybrid";

/** `RAIZ_ASSISTANT_MODE` -- default SEMPRE `"local"`. Qualquer valor que não seja exatamente `"hybrid"`
 *  (incluindo ausente, vazio, com erro de digitação) cai em `"local"` -- fail-safe pro modo mais restrito,
 *  nunca pro mais permissivo. Ter `GEMINI_API_KEY` configurada NUNCA basta sozinho -- ver
 *  `resolveGenerativeProvider` (`assistant-generative-provider-resolver.ts`), que exige os dois. */
export function resolveAssistantMode(): AssistantMode {
  return (process.env.RAIZ_ASSISTANT_MODE ?? "").trim().toLowerCase() === "hybrid" ? "hybrid" : "local";
}

export type GenerativeOutcome = "not_attempted" | "approved" | "rejected_by_gate" | "provider_error" | "timeout" | "rate_limited";

export type AssistantRoutingTelemetry = {
  mode: AssistantMode;
  localHandling: AssistantHandlingResult;
  escalatedToGenerative: boolean;
  generativeOutcome: GenerativeOutcome;
  generativeProvider?: string;
  generativeModel?: string;
  generativeLatencyMs?: number;
  generativeTokensUsed?: number;
  /** Nunca um erro técnico cru de um provedor externo (nunca "429"/"Google"/stack trace) -- só uma frase
   *  curta em português pra auditoria interna (`route.ts` nunca devolve isto ao client). */
  fallbackReason?: string;
};

export type RoutedAssistantResult = { response: OperationalAssistantResponse; routing: AssistantRoutingTelemetry };

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout após ${ms}ms sem resposta`)), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

function sanitized(response: OperationalAssistantResponse): OperationalAssistantResponse {
  // Defesa em profundidade (Fase 4, Bloco 6/4F): mesmo garantia já aplicada em `route.ts`, reaplicada aqui
  // -- nenhuma resposta sai do router sem passar por isto, não importa por qual caminho (local direto,
  // generativo aprovado, ou fallback).
  return { ...response, cards: sanitizeLegacyCards(response) };
}

export async function routeAssistantRequest(
  request: OperationalAssistantRequest,
  // `timeoutMs` -- só pra teste (`e2e/assistant-fase4g.spec.ts` via rota dev-only), nunca passado pelo
  // caminho real (`route.ts` sempre usa `generativeTimeoutMs()`, lido de `RAIZ_ASSISTANT_GENERATIVE_TIMEOUT_MS`).
  options: { mode?: AssistantMode; generativeProvider?: OperationalAssistantProvider | null; timeoutMs?: number } = {},
): Promise<RoutedAssistantResult> {
  const mode = options.mode ?? resolveAssistantMode();
  const localResponse = await localIntentAssistantProvider.ask(request);
  const baseRouting: AssistantRoutingTelemetry = { mode, localHandling: localResponse.handling, escalatedToGenerative: false, generativeOutcome: "not_attempted" };

  // Item 1 -- o local É a base; funciona sozinho sempre. Item 2 -- só escalona quando o local
  // EXPLICITAMENTE não reconheceu a pergunta (`"unsupported"`) -- nunca pra `"insufficient_evidence"` (se
  // o dado não existe, um provider generativo também não pode inventá-lo).
  if (mode === "local" || localResponse.handling !== "unsupported") {
    return { response: sanitized(localResponse), routing: baseRouting };
  }

  const generativeProvider = options.generativeProvider;
  if (!generativeProvider) {
    return { response: sanitized(localResponse), routing: baseRouting };
  }

  const limitCheck = await checkGenerativeUsageLimit(request.tenantId, request.userId);
  if (!limitCheck.allowed) {
    return { response: sanitized(localResponse), routing: { ...baseRouting, generativeOutcome: "rate_limited", fallbackReason: limitCheck.reason } };
  }

  const started = Date.now();
  let candidateResponse: OperationalAssistantResponse | undefined;
  let errorMessage: string | undefined;
  let timedOut = false;
  try {
    candidateResponse = await withTimeout(generativeProvider.ask(request), options.timeoutMs ?? generativeTimeoutMs());
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error);
    timedOut = errorMessage.includes("timeout após");
  }
  const generativeLatencyMs = Date.now() - started;

  if (!candidateResponse) {
    return {
      response: sanitized(localResponse),
      routing: { ...baseRouting, escalatedToGenerative: true, generativeOutcome: timedOut ? "timeout" : "provider_error", generativeProvider: generativeProvider.name, generativeModel: generativeProvider.model, generativeLatencyMs, fallbackReason: errorMessage },
    };
  }

  const catalog = buildEvidenceCatalog(request.evidence);
  const violations = checkResponseGrounding(candidateResponse, catalog);
  if (violations.length > 0) {
    return {
      response: sanitized(localResponse),
      routing: { ...baseRouting, escalatedToGenerative: true, generativeOutcome: "rejected_by_gate", generativeProvider: generativeProvider.name, generativeModel: generativeProvider.model, generativeLatencyMs, fallbackReason: violations.map((v) => v.rule).join(", ") },
    };
  }

  return {
    response: sanitized(candidateResponse),
    routing: {
      ...baseRouting, escalatedToGenerative: true, generativeOutcome: "approved",
      generativeProvider: generativeProvider.name, generativeModel: generativeProvider.model, generativeLatencyMs,
      generativeTokensUsed: (candidateResponse as { tokensUsed?: number }).tokensUsed,
    },
  };
}
