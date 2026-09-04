import type { KnowledgeResearchSource } from "@/lib/ai/knowledge-research-schema";
import { claudeKnowledgeResearchProvider } from "@/lib/ai/providers/claude-knowledge-research-provider";
import { unavailableKnowledgeResearchProvider } from "@/lib/ai/providers/unavailable-knowledge-research-provider";

/**
 * A pesquisa periódica é a ÚNICA parte da IA agronômica que usa busca na
 * internet -- de propósito: é cara e demorada, então acontece raramente
 * (uma vez a cada tantos dias, sob controle do curador), nunca por laudo.
 * O laudo do dia a dia (`agronomic-prescription-provider.ts`) só lê o que
 * já foi pesquisado e homologado, sem pesquisar de novo.
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

export function resolveKnowledgeResearchProvider(): KnowledgeResearchProvider {
  if (process.env.ANTHROPIC_API_KEY) return claudeKnowledgeResearchProvider;
  return unavailableKnowledgeResearchProvider;
}
