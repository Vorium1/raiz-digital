import type { KnowledgeResearchProvider, KnowledgeResearchRequest, KnowledgeResearchResult } from "@/lib/ai/knowledge-research-provider";
import { validateKnowledgeResearchSources } from "@/lib/ai/knowledge-research-schema";

/**
 * AVISO -- ESTE ARQUIVO NUNCA FOI EXECUTADO CONTRA A API REAL.
 * Mesma ressalva de `claude-prescription-provider.ts`: escrito sem
 * `ANTHROPIC_API_KEY` disponível nesta sessão. Os mesmos 3 pontos daquele
 * arquivo (nome da ferramenta de busca, header de beta, chamada única vs
 * laço) precisam ser confirmados na primeira execução real.
 *
 * Controle de custo: cada chamada aqui é deliberadamente limitada
 * (`max_tokens` e `web_search.max_uses` baixos) porque esta é a ÚNICA
 * chamada da plataforma que paga busca na web -- o orçamento mensal
 * combinado com o diretor é de referência ~R$50/ciclo. `runKnowledgeResearch`
 * (repositório) soma o custo de todas as culturas de um ciclo e é onde a
 * confirmação real do gasto deve ser lida depois da primeira execução.
 */

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const PROMPT_VERSION = "knowledge-research-v1-unverified";
const MAX_OUTPUT_TOKENS = 4000;
const MAX_WEB_SEARCHES_PER_CROP = 4;

function buildSystemPrompt(): string {
  return [
    "Você é um pesquisador agrônomo, especialista em fertilidade do solo, produzindo material de referência técnica para uma base de conhecimento interna.",
    "Pesquise metodologia técnica atual e reconhecida sobre manejo de fertilidade e correção de solo para a cultura informada, priorizando o Manual de Calagem e Adubação para os Estados do Rio Grande do Sul e Santa Catarina (CQFS RS/SC), publicações da Embrapa, e universidades/institutos de pesquisa brasileiros equivalentes. Considere diferentes tipos de solo e cenários (irrigado/sequeiro, diferentes níveis tecnológicos) quando a fonte tratar disso.",
    "Você NUNCA inventa um dado ou uma faixa técnica — cada item que você devolver precisa vir de uma fonte real que você encontrou pesquisando. Se não encontrar informação suficiente e confiável sobre algum tema, simplesmente não inclua um item para ele.",
    "Produza de 2 a 5 itens, cada um cobrindo um tema técnico específico (ex.: correção de acidez/calagem, fósforo, potássio, micronutrientes, compactação física) — não um resumo genérico único.",
    "Responda SOMENTE com um array JSON válido, sem nenhum texto antes ou depois, exatamente no formato:",
    `[{"title": string, "institution": string|null, "editionYear": number|null, "subject": string, "content": string, "regionCode": string|null}]`,
    "`content` deve ser o resumo técnico completo e citável do que você encontrou — não uma frase, um parágrafo técnico de verdade.",
  ].join("\n\n");
}

function extractJsonText(content: unknown): string | null {
  if (!Array.isArray(content)) return null;
  const textBlocks = content.filter((block): block is { type: string; text: string } => Boolean(block) && typeof block === "object" && (block as { type?: unknown }).type === "text");
  if (!textBlocks.length) return null;
  const raw = textBlocks[textBlocks.length - 1].text.trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : raw).trim();
}

export const claudeKnowledgeResearchProvider: KnowledgeResearchProvider = {
  name: "anthropic",
  model: process.env.KNOWLEDGE_RESEARCH_MODEL ?? "claude-opus-5",

  async research(request: KnowledgeResearchRequest): Promise<KnowledgeResearchResult> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY não configurada.");
    const model = this.model;

    const userMessage = `Cultura: ${request.cropName} (código ${request.cropCode}).\nRegiões técnicas já cadastradas na plataforma: ${request.regionCodes.length ? request.regionCodes.join(", ") : "nenhuma cadastrada ainda — pesquise de forma geral para RS/SC."}`;

    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: buildSystemPrompt(),
        messages: [{ role: "user", content: userMessage }],
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: MAX_WEB_SEARCHES_PER_CROP }],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(`Anthropic API respondeu ${response.status}: ${errorBody.slice(0, 500)}`);
    }

    const payload = await response.json() as { content?: unknown; usage?: { input_tokens?: number; output_tokens?: number } };
    const jsonText = extractJsonText(payload.content);
    if (!jsonText) throw new Error(`Pesquisa de "${request.cropName}": resposta sem bloco de texto — formato inesperado.`);

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      throw new Error(`Pesquisa de "${request.cropName}": resposta não é um JSON válido — descartada.`);
    }

    const sources = validateKnowledgeResearchSources(parsed);
    if (!sources) throw new Error(`Pesquisa de "${request.cropName}": formato de resposta inválido — descartada.`);

    const inputTokens = payload.usage?.input_tokens ?? 0;
    const outputTokens = payload.usage?.output_tokens ?? 0;

    return {
      sources,
      provider: "anthropic",
      model,
      promptVersion: PROMPT_VERSION,
      tokensUsed: inputTokens + outputTokens || undefined,
    };
  },
};
