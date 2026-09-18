import type { KnowledgeResearchProvider, KnowledgeResearchRequest, KnowledgeResearchResult } from "@/lib/ai/knowledge-research-provider";
import { validateKnowledgeResearchSources } from "@/lib/ai/knowledge-research-schema";
import { AGRONOMY_KNOWLEDGE_COVERAGE_TEXT } from "@/domain/agronomy-knowledge-domains";

/**
 * AVISO -- ESTE ARQUIVO NUNCA FOI EXECUTADO CONTRA A API REAL.
 * Mesma ressalva dos provedores da Anthropic: escrito sem `OPENAI_API_KEY`
 * disponível nesta sessão. Usa a Responses API da OpenAI com a ferramenta
 * de busca na web (`web_search_preview`) -- o nome exato dessa ferramenta e
 * o formato de resposta (`output` em vez de `content`, texto agregado em
 * `output_text`) precisam ser confirmados na primeira execução real; ver
 * `extractJsonText` para onde ajustar se o formato vier diferente.
 * Existe só pra permitir cruzar a pesquisa com outro provedor independente
 * (pedido do diretor) -- nunca é usada no laudo por análise, só na
 * pesquisa periódica.
 */

const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const PROMPT_VERSION = "knowledge-research-openai-v1-unverified";
const MAX_OUTPUT_TOKENS = 4000;

function buildInstructions(): string {
  return [
    "Você é um pesquisador agrônomo multidisciplinar, produzindo material de referência técnica para uma base de conhecimento interna.",
    "Pesquise conhecimento técnico atual e reconhecido para a cultura informada. Priorize fontes oficiais, manuais regionais, Embrapa, universidades, sociedades científicas e artigos revisados por pares. Não limite a pesquisa a fertilidade.",
    "Você NUNCA inventa um dado ou uma faixa técnica — cada item que você devolver precisa vir de uma fonte real que você encontrou pesquisando. Se não encontrar informação suficiente e confiável sobre algum tema, simplesmente não inclua um item para ele.",
    "Produza de 4 a 8 itens cobrindo áreas diferentes e relevantes da matriz curricular abaixo; não repita o mesmo tema só para preencher quantidade.",
    "Matriz de cobertura agronômica (define O QUE investigar, nunca a dose):\n" + AGRONOMY_KNOWLEDGE_COVERAGE_TEXT,
    "Responda SOMENTE com um array JSON válido, sem nenhum texto antes ou depois, exatamente no formato:",
    `[{"title": string, "institution": string|null, "editionYear": number|null, "subject": string, "content": string, "regionCode": string|null, "sourceUrl": string|null, "doi": string|null, "evidenceType": "REGIONAL_MANUAL"|"SYSTEMATIC_REVIEW"|"META_ANALYSIS"|"MULTILOCATION_TRIAL"|"CONTROLLED_FIELD_TRIAL"|"OBSERVATIONAL_FIELD"|"MECHANISTIC"|"UNCLASSIFIED", "evidenceStrength": "DIRECT_STRONG"|"TRANSFERRED_STRONG"|"MODERATE"|"EXPERIMENTAL"|"OBSERVATIONAL"|"CONFLICTING"|"INSUFFICIENT"|"UNASSESSED", "requiresLocalCalibration": boolean, "requiresAgronomistReview": boolean, "quantitativeUseStatus": "CONTEXT_ONLY"|"REVIEW_ONLY"}]`,
    "`content` deve resumir fielmente o que a fonte sustenta, incluindo condições e limites. `sourceUrl` ou `doi` deve identificar a fonte original sempre que disponível. Não marque uma afirmação quantitativa como homologada; pesquisa não cria regra de dose.",
  ].join("\n\n");
}

function extractJsonText(payload: unknown): string | null {
  const record = payload as Record<string, unknown>;
  if (typeof record.output_text === "string" && record.output_text.trim()) {
    const raw = record.output_text.trim();
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    return (fenced ? fenced[1] : raw).trim();
  }
  return null;
}

export const openaiKnowledgeResearchProvider: KnowledgeResearchProvider = {
  name: "openai",
  model: process.env.OPENAI_KNOWLEDGE_RESEARCH_MODEL ?? "gpt-5",

  async research(request: KnowledgeResearchRequest): Promise<KnowledgeResearchResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY não configurada.");
    const model = this.model;

    const userMessage = `Cultura: ${request.cropName} (código ${request.cropCode}).\nRegiões técnicas já cadastradas na plataforma: ${request.regionCodes.length ? request.regionCodes.join(", ") : "nenhuma cadastrada ainda — pesquise de forma geral para RS/SC."}`;

    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        instructions: buildInstructions(),
        input: userMessage,
        max_output_tokens: MAX_OUTPUT_TOKENS,
        tools: [{ type: "web_search_preview" }],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(`OpenAI API respondeu ${response.status}: ${errorBody.slice(0, 500)}`);
    }

    const payload = await response.json() as { usage?: { input_tokens?: number; output_tokens?: number } };
    const jsonText = extractJsonText(payload);
    if (!jsonText) throw new Error(`Pesquisa (OpenAI) de "${request.cropName}": resposta sem texto de saída — formato inesperado.`);

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      throw new Error(`Pesquisa (OpenAI) de "${request.cropName}": resposta não é um JSON válido — descartada.`);
    }

    const sources = validateKnowledgeResearchSources(parsed);
    if (!sources) throw new Error(`Pesquisa (OpenAI) de "${request.cropName}": formato de resposta inválido — descartada.`);

    return {
      sources,
      provider: "openai",
      model,
      promptVersion: PROMPT_VERSION,
      tokensUsed: (payload.usage?.input_tokens ?? 0) + (payload.usage?.output_tokens ?? 0) || undefined,
    };
  },
};
