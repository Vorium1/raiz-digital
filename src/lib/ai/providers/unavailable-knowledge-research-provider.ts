import type { KnowledgeResearchProvider } from "@/lib/ai/knowledge-research-provider";

export class KnowledgeResearchProviderUnavailableError extends Error {
  constructor() {
    super("A IA de pesquisa ainda não está conectada neste servidor (falta configurar ANTHROPIC_API_KEY).");
    this.name = "KnowledgeResearchProviderUnavailableError";
  }
}

export const unavailableKnowledgeResearchProvider: KnowledgeResearchProvider = {
  name: "unavailable",
  model: "none",
  async research() {
    throw new KnowledgeResearchProviderUnavailableError();
  },
};
