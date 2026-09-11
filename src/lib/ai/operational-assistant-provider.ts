import { localIntentAssistantProvider } from "@/lib/ai/providers/local-intent-assistant-provider";
import type { AssistantScreenContext, AssistantScreenState } from "@/lib/ai/assistant-screen";
import type { AssistantEvidenceResult } from "@/lib/ai/assistant-evidence";
import type { AssistantStructuredResponse } from "@/lib/ai/assistant-response-schema";

/**
 * Interface desacoplada do Assistente RAIZ (IA operacional) — distinta do
 * AgronomicExplanationProvider porque tem risco e escopo diferentes: aqui
 * a IA nunca toca em classificação técnica, só organiza/consulta dado
 * operacional (coleta, laudo, revisão, comparação) que o usuário já tem
 * permissão para ver.
 *
 * Fase 4A: `AssistantScreenContext`/`AssistantScreenState` agora vêm de
 * `assistant-screen.ts` (fonte única, ver Correção 4 da arquitetura --
 * contexto de tela e estado/filtros são conceitos diferentes). O request
 * carrega o Evidence Package já resolvido no servidor (`assistant-evidence.ts`)
 * -- o provider nunca recebe conexão de banco, só o objeto pronto. A resposta
 * agora é a `AssistantStructuredResponse` (fato/atenção/padrão/hipótese/
 * revisão necessária), não mais um texto solto.
 */

export type { AssistantScreenContext, AssistantScreenState };

export type OperationalAssistantRequest = {
  question: string;
  tenantId: string;
  userId: string;
  role: string;
  screenContext?: AssistantScreenContext;
  screenState?: AssistantScreenState;
  /** Evidence Package já resolvido pelo endpoint (`assistant-evidence.ts`) -- `found: false` quando o
   *  `ScreenContext` apontava pra uma entidade que não existe/não pertence ao tenant da sessão; o provider
   *  precisa tratar isso como "sem evidência disponível", nunca inventar dado no lugar. */
  evidence?: AssistantEvidenceResult;
};

/**
 * Fase 4G, item 2 — sinalização ESTRUTURADA de como o provider tratou a pergunta, nunca inferida por
 * texto (nunca `summary.includes("não entendi")`). Todo provider (local hoje, Gemini/self-hosted amanhã)
 * declara isso explicitamente:
 * - `"handled"` — reconheceu a pergunta e respondeu com dado real (inclusive uma contagem "0" honesta,
 *   que é uma resposta completa, não uma lacuna).
 * - `"insufficient_evidence"` — reconheceu a INTENÇÃO da pergunta, mas a evidência necessária não existe/
 *   não resolveu (ex.: comparar safra sem uma segunda safra cadastrada, contexto de tela inválido). Um
 *   provider generativo NUNCA deve ser chamado pra "preencher" este caso -- se o dado não existe, um
 *   provider generativo também não pode inventá-lo (`assistant-provider-router.ts` nunca escalona quando o
 *   local devolve isto).
 * - `"unsupported"` — nenhuma intenção/capacidade reconhecida pra esta pergunta. É o ÚNICO caso em que o
 *   router (modo híbrido) considera escalonar pra um provider generativo opcional.
 */
export type AssistantHandlingResult = "handled" | "unsupported" | "insufficient_evidence";

export type OperationalAssistantResponse = AssistantStructuredResponse & {
  suggestedQuestions: string[];
  provider: string;
  model: string;
  isRealLanguageModel: boolean;
  generatedAt: string;
  handling: AssistantHandlingResult;
};

export interface OperationalAssistantProvider {
  readonly name: string;
  readonly model: string;
  readonly isRealLanguageModel: boolean;
  ask(request: OperationalAssistantRequest): Promise<OperationalAssistantResponse>;
}

/**
 * Hoje sempre devolve o provedor local (`localIntentAssistantProvider`):
 * reconhece um conjunto de intenções (coleta atrasada, pontos pendentes,
 * laudos do mês, revisões pendentes, confiabilidade, comparação de safra,
 * resumo de propriedade, pendências gerais) e responde com consulta real
 * ao banco — sem IA generativa, sem custo, sem chave de API. Perguntas
 * fora desse repertório recebem uma resposta honesta pedindo para
 * reformular, em vez de um texto inventado.
 */
export function resolveOperationalAssistantProvider(): OperationalAssistantProvider {
  return localIntentAssistantProvider;
}
