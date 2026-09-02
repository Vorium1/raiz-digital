import { localIntentAssistantProvider } from "@/lib/ai/providers/local-intent-assistant-provider";

/**
 * Interface desacoplada do Assistente RAIZ (IA operacional) — distinta do
 * AgronomicExplanationProvider porque tem risco e escopo diferentes: aqui
 * a IA nunca toca em classificação técnica, só organiza/consulta dado
 * operacional (coleta, laudo, revisão, comparação) que o usuário já tem
 * permissão para ver.
 */

export type AssistantScreenContext =
  | { type: "field"; id: string }
  | { type: "analysis"; id: string }
  | { type: "property"; id: string }
  | { type: "dashboard" };

export type OperationalAssistantRequest = {
  question: string;
  tenantId: string;
  userId: string;
  role: string;
  screenContext?: AssistantScreenContext;
};

export type AssistantCard = { title: string; description: string; href?: string };

export type OperationalAssistantResponse = {
  answer: string;
  cards: AssistantCard[];
  suggestedQuestions: string[];
  provider: string;
  model: string;
  isRealLanguageModel: boolean;
  generatedAt: string;
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
