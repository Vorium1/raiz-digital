import type { OperationalAssistantProvider, OperationalAssistantRequest, OperationalAssistantResponse } from "@/lib/ai/operational-assistant-provider";
import { buildEvidenceCatalog } from "@/lib/ai/assistant-evidence-catalog";
import { checkResponseGrounding, type GroundingViolation } from "@/lib/ai/assistant-grounding-gate";

/**
 * Fase 4F, item 6 — envolve um provider CANDIDATO (Gemini ou qualquer futuro provider generativo) com o
 * grounding gate: se a resposta do candidato violar alguma regra de rastreabilidade (id inventado, número
 * não presente na evidência, nome de entidade desconhecido, coincidência espacial, causalidade
 * apresentada como fato, URL solta, recomendação fora de escopo), a resposta do candidato é DESCARTADA
 * inteira -- nunca "consertada" com outro texto gerativo -- e a resposta vem do `fallback` (o provider
 * local determinístico) pra essa MESMA requisição.
 *
 * Reusável, mas **não usado por `resolveOperationalAssistantProvider()`** nesta fase -- só pelo harness de
 * benchmark e pelos testes do grounding gate. Ativar isso na aplicação real é decisão do Bloco 7, fora do
 * escopo da Fase 4F.
 */
export function createGroundedProvider(candidate: OperationalAssistantProvider, fallback: OperationalAssistantProvider): OperationalAssistantProvider {
  return {
    name: candidate.name,
    model: candidate.model,
    isRealLanguageModel: candidate.isRealLanguageModel,
    async ask(request: OperationalAssistantRequest): Promise<OperationalAssistantResponse> {
      const catalog = buildEvidenceCatalog(request.evidence);
      let result: OperationalAssistantResponse;
      try {
        result = await candidate.ask(request);
      } catch {
        // Provider candidato falhou (erro de rede, cota, JSON inválido) -- mesmo tratamento de uma
        // resposta reprovada pelo gate: cai pro fallback, nunca propaga o erro pro client.
        return fallback.ask(request);
      }
      const violations = checkResponseGrounding(result, catalog);
      if (violations.length > 0) return fallback.ask(request);
      return result;
    },
  };
}

export type { GroundingViolation };
