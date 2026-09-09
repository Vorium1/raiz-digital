import type { KnowledgeResearchSource } from "@/lib/ai/knowledge-research-schema";
import { claudeKnowledgeResearchProvider } from "@/lib/ai/providers/claude-knowledge-research-provider";
import { openaiKnowledgeResearchProvider } from "@/lib/ai/providers/openai-knowledge-research-provider";
import { geminiKnowledgeResearchProvider } from "@/lib/ai/providers/gemini-knowledge-research-provider";

/**
 * A pesquisa periódica é a ÚNICA parte da IA agronômica que usa busca na
 * internet -- de propósito: é cara e demorada, então acontece raramente
 * (uma vez a cada tantos dias, sob controle do curador), nunca por laudo.
 * O laudo do dia a dia (`agronomic-prescription-provider.ts`) só lê o que
 * já foi pesquisado e homologado, sem pesquisar de novo.
 *
 * Multiprovedor (pedido do diretor, 2026-09-04): em vez de confiar cegamente
 * num único provedor, cada provedor com chave configurada pesquisa a MESMA
 * cultura de forma independente, e todos os resultados ficam lado a lado,
 * marcados com qual IA disse o quê -- é o curador humano que cruza e decide
 * o que homologar, nunca um "algoritmo de consenso" automático (duas IAs
 * erradas concordando não vira verdade). Ficar sem nenhum provedor
 * configurado é um estado normal (lista vazia), não um erro de código --
 * quem chama decide o que fazer com uma lista vazia.
 */

export type KnowledgeResearchRequest = {
  cropCode: string;
  cropName: string;
  regionCodes: string[];
};

export type KnowledgeResearchResult = {
  sources: KnowledgeResearchSource[];
  provider: string;
  model: string;
  promptVersion: string;
  tokensUsed?: number;
  costUsd?: number;
};

export interface KnowledgeResearchProvider {
  readonly name: string;
  readonly model: string;
  research(request: KnowledgeResearchRequest): Promise<KnowledgeResearchResult>;
}

/**
 * Todo provedor cuja chave de API está configurada no servidor, nesta
 * ordem: Anthropic, OpenAI, Google. Lista vazia quando nenhuma chave existe
 * -- estado normal, tratado pelo chamador (rota), não uma exceção aqui.
 */
export function resolveAvailableKnowledgeResearchProviders(): KnowledgeResearchProvider[] {
  const providers: KnowledgeResearchProvider[] = [];
  if (process.env.ANTHROPIC_API_KEY) providers.push(claudeKnowledgeResearchProvider);
  if (process.env.OPENAI_API_KEY) providers.push(openaiKnowledgeResearchProvider);
  if (process.env.GEMINI_API_KEY) providers.push(geminiKnowledgeResearchProvider);
  return providers;
}
